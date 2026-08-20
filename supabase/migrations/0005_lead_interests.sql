-- ============================================================================
-- Buyer interest fields on leads, so the broker can record what a prospective
-- buyer wants and search the lead list against it later.
--
--   interested_categories : the business types a buyer is looking for
--                           (e.g. {'Laundromat','Dry Cleaners'})
--   investment_amount     : how much they're prepared to invest (USD)
--
-- Both are staff-only via the existing leads RLS policy — no policy change.
-- ============================================================================

alter table public.leads add column if not exists interested_categories text[] not null default '{}';
alter table public.leads add column if not exists investment_amount numeric;

-- GIN index so "buyers interested in X" (array containment) stays fast, and a
-- btree on the amount for range search.
create index if not exists leads_interested_categories_idx on public.leads using gin (interested_categories);
create index if not exists leads_investment_amount_idx on public.leads (investment_amount);
