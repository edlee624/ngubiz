-- ============================================================================
-- Human-friendly listing reference number.
--
-- The primary key is a UUID (great for links, unfriendly to quote to a client).
-- This adds a short sequential number, ref_no, shown in the UI as "NGU-1001".
-- Existing rows are backfilled in creation order; new listings get the next
-- number automatically. Safe to re-run.
-- ============================================================================

create sequence if not exists listings_ref_no_seq as bigint start with 1001;

alter table public.listings add column if not exists ref_no bigint;

-- Backfill any rows without a number yet, oldest first.
with ordered as (
  select id, row_number() over (order by created_at, id) as rn
  from public.listings
  where ref_no is null
)
update public.listings l
   set ref_no = 1000 + o.rn
  from ordered o
 where l.id = o.id;

-- Point the sequence past the highest number in use (or 1000 if the table is
-- empty, so the first insert becomes 1001).
select setval('listings_ref_no_seq', coalesce((select max(ref_no) from public.listings), 1000));

alter table public.listings alter column ref_no set default nextval('listings_ref_no_seq');
alter table public.listings alter column ref_no set not null;
create unique index if not exists listings_ref_no_key on public.listings (ref_no);
