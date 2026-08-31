-- ============================================================================
-- Let the public "prospective buyers" form carry the CRM fields.
--
-- submit_inquiry() gains company, timeframe, investment_amount and the
-- interested-categories list, so a buyer who signs up on the site lands in the
-- Leads pipeline already populated and searchable — same as if the broker had
-- typed them in. The signature changes, so drop the old one first.
-- ============================================================================

set check_function_bodies = off;

drop function if exists public.submit_inquiry(text, text, text, text, uuid, lead_type, uuid);

create or replace function public.submit_inquiry(
  p_name text,
  p_email text,
  p_message text,
  p_phone text default null,
  p_listing_id uuid default null,
  p_type lead_type default 'inquiry',
  p_broker_id uuid default null,
  p_company text default null,
  p_timeframe text default null,
  p_investment_amount numeric default null,
  p_categories text[] default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_broker uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'Name and email are required';
  end if;

  -- A referenced listing must be live (don't leak draft ids).
  if p_listing_id is not null and not exists (
    select 1 from public.listings l where l.id = p_listing_id and public.listing_is_live(l.status)
  ) then
    p_listing_id := null;
  end if;

  -- Resolve broker: explicit wins, else inherit from the listing.
  v_broker := p_broker_id;
  if v_broker is not null and not exists (
    select 1 from public.brokers b where b.id = v_broker and b.is_active
  ) then
    v_broker := null;
  end if;
  if v_broker is null and p_listing_id is not null then
    select l.broker_id into v_broker from public.listings l where l.id = p_listing_id;
  end if;

  insert into public.leads (
    type, stage, listing_id, broker_id, name, email, phone, company, message,
    timeframe, investment_amount, interested_categories, source)
  values (
    coalesce(p_type, 'inquiry'), 'new', p_listing_id, v_broker, p_name, p_email, p_phone,
    nullif(trim(coalesce(p_company, '')), ''), p_message,
    nullif(trim(coalesce(p_timeframe, '')), ''), p_investment_amount,
    coalesce(p_categories, '{}'), 'website');
end; $$;

grant execute on function public.submit_inquiry(text, text, text, text, uuid, lead_type, uuid, text, text, numeric, text[]) to anon, authenticated;
