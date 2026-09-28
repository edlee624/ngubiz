-- ============================================================================
-- CRM pipeline refresh + lead-to-listing linking.
--
-- 1. New pipeline stages. lead_stage is an enum, so the values are ADDED (enum
--    values can't be dropped; the retired ones just stop being shown). The app
--    controls column order and labels, so display order here doesn't matter.
--      new                -> "New Lead"
--      contacted_noreply  -> "Contacted-NoReply"   (new)
--      contacted          -> "Contacted"
--      showed             -> "Showed Listing"      (new)
--      offered            -> "Offered"             (new)
--      closed             -> "Closed"              (new)
--
-- 2. lead_listings: a lead can be linked to many listings (and a listing to
--    many leads). Seeded from the single listing_id already on each lead.
--
-- NOTE: a newly added enum value cannot be USED in the same transaction that
-- adds it. This migration never references the new values, so it is safe to run
-- in one pass. (The optional legacy re-map is handled separately in chat.)
-- Safe to re-run.
-- ============================================================================

alter type public.lead_stage add value if not exists 'contacted_noreply';
alter type public.lead_stage add value if not exists 'showed';
alter type public.lead_stage add value if not exists 'offered';
alter type public.lead_stage add value if not exists 'closed';

create table if not exists public.lead_listings (
  lead_id    uuid not null references public.leads(id)    on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, listing_id)
);
create index if not exists lead_listings_listing_idx on public.lead_listings (listing_id);

alter table public.lead_listings enable row level security;

-- Staff-only, mirroring lead visibility. The public never reads leads or links.
drop policy if exists lead_listings_staff_all on public.lead_listings;
create policy lead_listings_staff_all on public.lead_listings
  for all using (public.is_staff()) with check (public.is_staff());

-- Seed the join table from the single listing_id already stored on each lead.
insert into public.lead_listings (lead_id, listing_id)
select id, listing_id from public.leads
 where listing_id is not null
on conflict do nothing;
