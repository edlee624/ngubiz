-- ============================================================================
-- Brokers as a first-class entity.
--
-- Previously the team was hardcoded in public/config.js. This promotes brokers
-- to real CMS data: managed in /admin, attributed on every listing ("Listed by"),
-- with their own public profile pages at /broker/<slug>.
--
-- Also lets an inquiry be routed to a specific broker (leads.broker_id), which
-- is how the contact form on a broker's profile page works.
-- ============================================================================

set check_function_bodies = off;

create table public.brokers (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,                 -- public URL: /broker/<slug>
  name        text not null,
  title       text,                                  -- "Licensed NYS Commercial & Residential Broker"
  license_no  text,
  phone       text,
  email       text,
  photo_url   text,
  bio         text,
  is_active   boolean not null default true,         -- inactive = hidden from the public site
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.brokers enable row level security;
create trigger brokers_touch before update on public.brokers for each row execute function public.touch_updated_at();
create index on public.brokers (sort_order);

-- Active brokers are public (they're the firm's public face). Staff manage them.
create policy "brokers: public read active" on public.brokers for select
  using (is_active or public.is_staff());
create policy "brokers: staff write" on public.brokers for all
  using (public.is_staff()) with check (public.is_staff());

-- Attribute listings to a broker. Null = unassigned (falls back to firm contact).
alter table public.listings add column broker_id uuid references public.brokers(id) on delete set null;
create index on public.listings (broker_id);

-- Route a lead to a broker (e.g. the form on a broker's profile page).
alter table public.leads add column broker_id uuid references public.brokers(id) on delete set null;
create index on public.leads (broker_id);

-- ---------------------------------------------------------------------------
-- submit_inquiry gains p_broker_id. Signature changes, so drop + recreate.
-- ---------------------------------------------------------------------------
drop function if exists public.submit_inquiry(text, text, text, text, uuid, lead_type);

create or replace function public.submit_inquiry(
  p_name text,
  p_email text,
  p_message text,
  p_phone text default null,
  p_listing_id uuid default null,
  p_type lead_type default 'inquiry',
  p_broker_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_broker uuid;
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

  -- Resolve the broker: explicit wins, else inherit from the listing.
  v_broker := p_broker_id;
  if v_broker is not null and not exists (
    select 1 from public.brokers b where b.id = v_broker and b.is_active
  ) then
    v_broker := null;
  end if;
  if v_broker is null and p_listing_id is not null then
    select l.broker_id into v_broker from public.listings l where l.id = p_listing_id;
  end if;

  insert into public.leads (type, stage, listing_id, broker_id, name, email, phone, message, source)
  values (coalesce(p_type, 'inquiry'), 'new', p_listing_id, v_broker, p_name, p_email, p_phone, p_message, 'website');
end; $$;

grant execute on function public.submit_inquiry(text, text, text, text, uuid, lead_type, uuid) to anon, authenticated;

-- sign_nda: also stamp the listing's broker onto the buyer lead it creates.
create or replace function public.sign_nda(
  p_listing_id uuid,
  p_name text,
  p_email text,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_lead_id uuid;
  v_broker  uuid;
  v_docs    jsonb;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'Name and email are required';
  end if;
  if not exists (
    select 1 from public.listings l where l.id = p_listing_id and public.listing_is_live(l.status)
  ) then
    raise exception 'Listing not found';
  end if;

  select broker_id into v_broker from public.listings where id = p_listing_id;

  select id into v_lead_id from public.leads
    where email = p_email and listing_id = p_listing_id and type = 'buyer' limit 1;
  if v_lead_id is null then
    insert into public.leads (type, stage, listing_id, broker_id, name, email, phone, message, source)
    values ('buyer', 'nda_signed', p_listing_id, v_broker, p_name, p_email, p_phone,
            'Signed NDA to access documents', 'website')
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

grant execute on function public.sign_nda(uuid, text, text, text) to anon, authenticated;
