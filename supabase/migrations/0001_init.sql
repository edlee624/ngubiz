-- ============================================================================
-- Business Brokerage CMS — initial schema
--
-- Single-tenant: ONE brokerage (you). You (and any staff) log in via Supabase
-- Auth and manage everything. The public site is anonymous — visitors browse
-- published listings, submit inquiries, and sign NDAs to unlock confidential
-- documents. All public writes go through SECURITY DEFINER RPCs so the anon
-- client can never read leads, NDAs, or draft listings.
--
-- Security model: the browser talks to Postgres directly through Supabase, so
-- Row Level Security (RLS) is the real boundary. Every table has RLS enabled.
-- The anon/auth client can ONLY do what the policies + RPCs below allow.
-- ============================================================================

create extension if not exists "pgcrypto";

-- Policies reference helper functions defined below; defer body validation so
-- creation order doesn't error.
set check_function_bodies = off;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type listing_status as enum ('draft', 'active', 'under_offer', 'sold', 'withdrawn');
create type lead_type      as enum ('buyer', 'seller', 'inquiry');
create type lead_stage     as enum ('new', 'contacted', 'nda_signed', 'qualified', 'negotiating', 'closed_won', 'closed_lost');
create type app_role       as enum ('admin', 'staff');

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies can call them without
-- recursing into RLS). STABLE; search_path pinned for safety.
-- ---------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- ===========================================================================
-- IDENTITY — every authenticated user with a profile row is brokerage staff.
-- (There is no public self-signup surfaced; you create staff logins yourself.)
-- ===========================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        app_role    not null default 'staff',
  full_name   text,
  email       text,
  created_at  timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: staff read"   on public.profiles for select using (public.is_staff());
create policy "profiles: self update"  on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: admin manage" on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- Provision a profile row when a new auth user is created. First-ever user is
-- promoted to admin automatically; everyone after defaults to staff.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_role app_role;
begin
  select case when not exists (select 1 from public.profiles) then 'admin' else 'staff' end into v_role;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), v_role);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- LISTINGS — businesses for sale
-- ===========================================================================
create table public.listings (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,               -- public URL: /listing/<slug>
  status             listing_status not null default 'draft',
  is_featured        boolean not null default false,

  -- Headline / classification
  title              text not null,                       -- "Luxury Hair Salon"
  headline           text,                                -- short teaser line
  category           text,                                -- "Beauty / Personal Care"
  city               text,
  state              text,
  county             text,
  location_note      text,                                -- e.g. "Relocatable" / area hidden for confidentiality

  -- Financials (nullable — not every figure is disclosed)
  asking_price       numeric(14,2),
  cash_flow          numeric(14,2),                        -- SDE / owner benefit
  gross_revenue      numeric(14,2),
  ebitda             numeric(14,2),
  ffe                numeric(14,2),                        -- furniture, fixtures & equipment value
  inventory          numeric(14,2),
  real_estate_value  numeric(14,2),
  rent               numeric(14,2),                        -- monthly rent
  is_ffe_included    boolean not null default true,
  is_inventory_included boolean not null default true,
  seller_financing   boolean not null default false,

  -- Narrative / details
  description        text,                                -- long free-text
  reason_for_selling text,
  support_training   text,
  growth_expansion   text,
  competition        text,
  facilities         text,
  established_year   int,
  employees          text,                                -- free text: "8 FT, 3 PT"
  real_estate        text,                                -- "Leased" / "Owned"
  building_sf        text,
  lease_expiration   text,
  is_franchise       boolean not null default false,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.listings enable row level security;
create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();
create index on public.listings (status);
create index on public.listings (category);
create index on public.listings (state, city);

-- A listing is "live" (publicly visible) when active / under_offer / sold.
create or replace function public.listing_is_live(s listing_status)
returns boolean language sql immutable as $$
  select s in ('active', 'under_offer', 'sold');
$$;

create policy "listings: public read live" on public.listings for select
  using (public.listing_is_live(status) or public.is_staff());
create policy "listings: staff write" on public.listings for all
  using (public.is_staff()) with check (public.is_staff());

-- ===========================================================================
-- LISTING IMAGES — public photos shown on the listing
-- ===========================================================================
create table public.listing_images (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings(id) on delete cascade,
  url         text not null,                              -- Supabase Storage public URL or external
  caption     text,
  is_primary  boolean not null default false,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.listing_images enable row level security;
create index on public.listing_images (listing_id, sort_order);

create policy "images: read where listing readable" on public.listing_images for select
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and (public.listing_is_live(l.status) or public.is_staff())
  ));
create policy "images: staff write" on public.listing_images for all
  using (public.is_staff()) with check (public.is_staff());

-- ===========================================================================
-- DOCUMENTS — confidential material (CIM, financials). NDA-gated.
-- Metadata is staff-only; the public reaches these ONLY through the
-- request_documents() RPC after signing an NDA for that listing.
-- ===========================================================================
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null references public.listings(id) on delete cascade,
  name         text not null,                             -- "Confidential Information Memorandum"
  file_url     text not null,                             -- storage URL delivered post-NDA
  requires_nda boolean not null default true,
  is_available boolean not null default true,             -- broker toggle to release/withhold
  sort_order   int not null default 0,
  created_at   timestamptz not null default now()
);
alter table public.documents enable row level security;
create index on public.documents (listing_id, sort_order);

-- Staff only. The public never selects this table directly.
create policy "documents: staff all" on public.documents for all
  using (public.is_staff()) with check (public.is_staff());

-- ===========================================================================
-- LEADS — inquiries, prospective buyers, prospective sellers. NEVER public.
-- ===========================================================================
create table public.leads (
  id          uuid primary key default gen_random_uuid(),
  type        lead_type   not null default 'inquiry',
  stage       lead_stage  not null default 'new',
  listing_id  uuid references public.listings(id) on delete set null, -- inquiry about a listing
  name        text not null,
  email       text,
  phone       text,
  company     text,
  message     text,                                       -- their original message
  -- Buyer qualification / seller intake (free text, filled by broker)
  budget      text,
  timeframe   text,
  notes       text,                                       -- private broker notes
  source      text not null default 'website',            -- website | referral | manual | ...
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.leads enable row level security;
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();
create index on public.leads (stage);
create index on public.leads (type);
create index on public.leads (listing_id);
create index on public.leads (created_at desc);

-- Staff only. Public creates leads through submit_inquiry() (security definer).
create policy "leads: staff all" on public.leads for all
  using (public.is_staff()) with check (public.is_staff());

-- ===========================================================================
-- NDAs — signature records. NEVER public. Created via sign_nda() RPC.
-- ===========================================================================
create table public.ndas (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid references public.listings(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,
  signer_name       text not null,
  signer_email      text not null,
  signer_phone      text,
  agreement_version text not null default 'v1',
  signed_at         timestamptz not null default now()
);
alter table public.ndas enable row level security;
create index on public.ndas (listing_id);
create index on public.ndas (signer_email);

create policy "ndas: staff read" on public.ndas for select using (public.is_staff());
-- inserts happen via sign_nda() (security definer), not the client.

-- ===========================================================================
-- PUBLIC RPCs — the only way the anonymous site writes data.
-- ===========================================================================

-- Contact / inquiry form on a listing (or general contact). Creates a lead.
create or replace function public.submit_inquiry(
  p_name text,
  p_email text,
  p_message text,
  p_phone text default null,
  p_listing_id uuid default null,
  p_type lead_type default 'inquiry'
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'Name and email are required';
  end if;
  -- If a listing is referenced, it must be live (don't leak draft ids).
  if p_listing_id is not null and not exists (
    select 1 from public.listings l where l.id = p_listing_id and public.listing_is_live(l.status)
  ) then
    p_listing_id := null;
  end if;

  insert into public.leads (type, stage, listing_id, name, email, phone, message, source)
  values (coalesce(p_type, 'inquiry'), 'new', p_listing_id, p_name, p_email, p_phone, p_message, 'website');
end; $$;

-- Sign an NDA for a listing, then receive its released documents. Records the
-- signature + a buyer lead, and returns the available documents so the browser
-- can reveal the download links. Returns [] if the listing has none released.
create or replace function public.sign_nda(
  p_listing_id uuid,
  p_name text,
  p_email text,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lead_id uuid;
  v_docs jsonb;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'Name and email are required';
  end if;
  if not exists (
    select 1 from public.listings l where l.id = p_listing_id and public.listing_is_live(l.status)
  ) then
    raise exception 'Listing not found';
  end if;

  -- Upsert a buyer lead for this signer + listing so the broker sees them in
  -- the pipeline at the nda_signed stage.
  select id into v_lead_id from public.leads
    where email = p_email and listing_id = p_listing_id and type = 'buyer' limit 1;
  if v_lead_id is null then
    insert into public.leads (type, stage, listing_id, name, email, phone, message, source)
    values ('buyer', 'nda_signed', p_listing_id, p_name, p_email, p_phone, 'Signed NDA to access documents', 'website')
    returning id into v_lead_id;
  else
    update public.leads set stage = 'nda_signed', phone = coalesce(p_phone, phone), updated_at = now()
      where id = v_lead_id;
  end if;

  insert into public.ndas (listing_id, lead_id, signer_name, signer_email, signer_phone)
  values (p_listing_id, v_lead_id, p_name, p_email, p_phone);

  select coalesce(jsonb_agg(jsonb_build_object('name', d.name, 'file_url', d.file_url) order by d.sort_order), '[]'::jsonb)
    into v_docs
    from public.documents d
    where d.listing_id = p_listing_id and d.is_available;

  return v_docs;
end; $$;

-- Expose RPCs to the anonymous role.
grant execute on function public.submit_inquiry(text, text, text, text, uuid, lead_type) to anon, authenticated;
grant execute on function public.sign_nda(uuid, text, text, text) to anon, authenticated;
