-- ============================================================================
-- Date-based, human-friendly listing reference: NGU<YY><MM><N>  e.g. NGU26091
--
-- Replaces the plain NGU-#### display (the ref_no column stays but is no longer
-- shown). N is a per-calendar-month sequence based on created_at, so the first
-- listing created in a month is ...1 and each new month restarts at 1.
-- A BEFORE INSERT trigger assigns the code to new listings automatically.
-- Safe to re-run.
-- ============================================================================

alter table public.listings add column if not exists ref_code text;

-- Backfill existing rows: per-month sequence, oldest first. 'YYMM' -> e.g. 2609.
with ordered as (
  select id,
         to_char(created_at, 'YYMM') as ym,
         row_number() over (partition by date_trunc('month', created_at)
                            order by created_at, id) as seq
  from public.listings
)
update public.listings l
   set ref_code = 'NGU' || o.ym || o.seq
  from ordered o
 where l.id = o.id and l.ref_code is null;

create unique index if not exists listings_ref_code_key on public.listings (ref_code);

-- Assign NGU<YY><MM><N> on insert. The prefix 'NGU'||YYMM is 7 chars, so the
-- sequence is everything from character 8 on. Uses max(existing N)+1 for the
-- row's month, so it survives deletions without reusing a number. SECURITY
-- DEFINER so the count sees every row regardless of the caller's RLS.
create or replace function public.assign_listing_ref_code()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_ym  text;
  v_seq int;
begin
  if new.ref_code is not null and new.ref_code <> '' then
    return new;
  end if;
  v_ym := to_char(coalesce(new.created_at, now()), 'YYMM');
  select coalesce(max(substr(ref_code, 8)::int), 0) + 1
    into v_seq
    from public.listings
   where ref_code like 'NGU' || v_ym || '%';
  new.ref_code := 'NGU' || v_ym || v_seq;
  return new;
end; $$;

drop trigger if exists listings_ref_code_biu on public.listings;
create trigger listings_ref_code_biu
before insert on public.listings
for each row execute function public.assign_listing_ref_code();
