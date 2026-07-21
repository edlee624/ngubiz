-- ============================================================================
-- Assign a listing to MANY agents (all / single / multiple).
--
-- Until now a listing had exactly one broker (listings.broker_id). This adds a
-- join table so a listing can be co-listed by any number of agents.
--
-- listings.broker_id is KEPT, and now means "primary agent": the one who owns
-- inbound enquiries. A lead has a single owner, so routing needs one. The join
-- table is who is *shown* on the listing; broker_id is who *gets the lead*.
-- The primary is always also present in listing_brokers (enforced below).
-- ============================================================================

set check_function_bodies = off;

create table if not exists public.listing_brokers (
  listing_id uuid not null references public.listings(id) on delete cascade,
  broker_id  uuid not null references public.brokers(id)  on delete cascade,
  created_at timestamptz not null default now(),
  primary key (listing_id, broker_id)
);
alter table public.listing_brokers enable row level security;
create index if not exists listing_brokers_broker_idx on public.listing_brokers (broker_id);

-- Readable wherever the parent listing is readable; staff manage.
drop policy if exists "listing_brokers: read where listing readable" on public.listing_brokers;
create policy "listing_brokers: read where listing readable" on public.listing_brokers for select
  using (exists (
    select 1 from public.listings l
    where l.id = listing_id and (public.listing_is_live(l.status) or public.is_staff())
  ));

drop policy if exists "listing_brokers: staff write" on public.listing_brokers;
create policy "listing_brokers: staff write" on public.listing_brokers for all
  using (public.is_staff()) with check (public.is_staff());

-- Backfill: every listing that already had a broker gets that assignment.
insert into public.listing_brokers (listing_id, broker_id)
select l.id, l.broker_id from public.listings l
where l.broker_id is not null
on conflict do nothing;

-- Keep the primary agent consistent: whenever listings.broker_id is set, make
-- sure that broker is also in the join table, so "assigned agents" can never
-- omit the person who receives the enquiries.
create or replace function public.sync_primary_broker()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.broker_id is not null then
    insert into public.listing_brokers (listing_id, broker_id)
    values (new.id, new.broker_id)
    on conflict do nothing;
  end if;
  return new;
end; $$;

drop trigger if exists listings_sync_primary_broker on public.listings;
create trigger listings_sync_primary_broker
  after insert or update of broker_id on public.listings
  for each row execute function public.sync_primary_broker();

-- If the primary agent is unassigned from a listing, promote another assigned
-- agent so enquiries still have an owner (or clear it if none are left).
create or replace function public.demote_unassigned_primary()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_next uuid;
begin
  if exists (select 1 from public.listings where id = old.listing_id and broker_id = old.broker_id) then
    select broker_id into v_next from public.listing_brokers
      where listing_id = old.listing_id and broker_id <> old.broker_id limit 1;
    update public.listings set broker_id = v_next where id = old.listing_id;
  end if;
  return old;
end; $$;

drop trigger if exists listing_brokers_demote_primary on public.listing_brokers;
create trigger listing_brokers_demote_primary
  after delete on public.listing_brokers
  for each row execute function public.demote_unassigned_primary();
