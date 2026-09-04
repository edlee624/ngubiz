-- ============================================================================
-- Manual display order for listings.
--
-- Adds sort_order so the broker can arrange how listings appear on the site
-- (lower = earlier). All existing rows default to 0, so until anything is
-- reordered the display is unchanged (featured first, then most-recent, as
-- before — that ordering is applied as a tiebreak).
-- ============================================================================

alter table public.listings add column if not exists sort_order int not null default 0;
create index if not exists listings_sort_order_idx on public.listings (sort_order);
