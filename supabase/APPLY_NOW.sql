-- =============================================================================
-- NGU Business Real Estate — apply outstanding changes. Paste and Run.
-- Safe to re-run. Creates the photo-upload bucket, restores every listing,
-- clears figures on CLOSED deals (fields + wording), keeps the active listing's
-- price, and points all photos at the committed images.
-- =============================================================================

-- 1. Storage bucket for admin photo uploads --------------------------------
insert into storage.buckets (id, name, public) values ('media','media',true)
on conflict (id) do update set public = true;
drop policy if exists "media: public read" on storage.objects;
create policy "media: public read" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "media: staff insert" on storage.objects;
create policy "media: staff insert" on storage.objects for insert with check (bucket_id = 'media' and public.is_staff());
drop policy if exists "media: staff update" on storage.objects;
create policy "media: staff update" on storage.objects for update using (bucket_id = 'media' and public.is_staff()) with check (bucket_id = 'media' and public.is_staff());
drop policy if exists "media: staff delete" on storage.objects;
create policy "media: staff delete" on storage.objects for delete using (bucket_id = 'media' and public.is_staff());

-- 2. Restore every listing (skips ones already present) --------------------
insert into public.listings
  (slug, status, is_featured, title, category, city, state, county,
   established_year, real_estate, building_sf, location_note, facilities, description,
   asking_price, cash_flow, gross_revenue, rent, lease_expiration, broker_id)
values
  ('laundromat-bronx-long-lease', 'active', true, 'Laundromat – Large Space, Long Lease', 'Laundromat', 'Bronx', 'NY', 'Bronx', null, 'Leased', '3,500 SF', 'Exact address disclosed after NDA', '50 washers and 50 dryers. Primarily a wholesale operation with strong recurring commercial accounts.', 'A large, well-established Bronx laundromat operating for over 20 years with a primarily wholesale model that drives dependable, high-margin revenue. Roughly $600k in annual revenue and $120k in owner cash flow, with a long 10-year lease in place — a turnkey opportunity with room to grow the retail and drop-off side.', 299000, 120000, 600000, 9700, '10-year lease remaining', (select id from public.brokers where slug = 'mary-lee')),
  ('laundromat-east-harlem-60-machines', 'sold', false, 'Large Laundromat – East Harlem', 'Laundromat', 'East Harlem', 'NY', 'Manhattan', null, 'Leased', '2,000 SF + 2,000 SF basement', 'Exact address disclosed after NDA', '60 machines (30 washers, 30 dryers). Prior laundry experience preferred for this operation.', 'A large East Harlem laundromat with 60 machines across a 2,000 SF store plus a full 2,000 SF basement. Established roughly four years.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('laundromat-east-harlem-new-machines', 'sold', false, 'Laundromat – New Machines, Large Space', 'Laundromat', 'East Harlem', 'NY', 'Manhattan', null, 'Leased', '2,000 SF + 2,000 SF basement', 'Exact address disclosed after NDA', 'New machines installed about three years ago. Absentee-run with an employee profit-sharing arrangement.', 'A spacious East Harlem laundromat under the current owner for about seven years, with newer machines and an absentee model supported by employee profit sharing.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('cafe-pizzeria-ues', 'sold', false, 'Café / Restaurant / Pizzeria – Upper East Side', 'Restaurant / Café', 'Upper East Side', 'NY', 'Manhattan', 2004, 'Leased', '1,700 SF + 1,700 SF basement', 'Exact address disclosed after NDA', 'Full café/restaurant/pizzeria build-out. Original owners retiring.', 'A long-running Upper East Side café, restaurant and pizzeria established in 2004 with a strong pre-pandemic trading history. Sold as the original owners retired.', null, null, null, null, null, (select id from public.brokers where slug = 'edward-lee')),
  ('dry-cleaners-lower-east-side', 'sold', false, 'Dry Cleaners – Lower East Side', 'Dry Cleaners', 'Lower East Side', 'NY', 'Manhattan', null, 'Leased', null, 'Exact address disclosed after NDA', 'Partial absentee operation serving a clientele of nearby finance employees.', 'A Lower East Side dry cleaner of 7+ years, run partially absentee, serving the surrounding finance workforce.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('dry-cleaners-bronx-large', 'sold', false, 'Dry Cleaners – Large Space', 'Dry Cleaners', 'Bronx', 'NY', 'Bronx', null, 'Leased', '1,500 SF', 'Exact address disclosed after NDA', '1,500 SF plant with 4 staff. Effectively the only dry cleaner serving the immediate area.', 'A 35+ year Bronx dry cleaner enjoying a local monopoly, with a 1,500 SF space and a team of four.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('laundromat-flushing-full-service', 'sold', false, 'Laundromat – Full Service, New Machines', 'Laundromat', 'Flushing', 'NY', 'Queens', null, 'Leased', null, 'Exact address disclosed after NDA', '35 new machines (under a year old). Full service including wash/fold and dry cleaning, on a busy commuter boulevard.', 'A 37-year full-service Queens laundromat on a commuter boulevard, refreshed with 35 nearly-new machines and offering wash/fold and dry cleaning.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('laundromat-queens-low-rent', 'sold', false, 'Laundromat – Long Lease, Low Rent', 'Laundromat', 'Queens', 'NY', 'Queens', null, 'Leased', '600 SF', 'Exact address disclosed after NDA', 'Compact, efficient store with very low rent — an ideal first business.', 'A 50+ year Queens laundromat with a standout low rent and a 10+ year lease in place — an ideal first business.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('dry-cleaners-bronx-yankee-stadium', 'sold', false, 'Dry Cleaners – Close to Yankee Stadium', 'Dry Cleaners', 'Bronx', 'NY', 'Bronx', null, 'Leased', '900 SF + 900 SF basement', 'Exact address disclosed after NDA', 'Established plant near Yankee Stadium with a long operating history.', 'A busy Bronx dry cleaner near Yankee Stadium, 40+ years established (12 under the current owner), with a steady local trade.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('laundromat-washington-heights-absentee', 'sold', false, 'Laundromat – Absentee, Long Lease', 'Laundromat', 'Washington Heights', 'NY', 'Manhattan', null, 'Leased', '1,000 SF', 'Exact address disclosed after NDA', 'Absentee-run with a long 14-year lease. Upside via wholesale, pickup/delivery, and dry cleaning.', 'An absentee-run Washington Heights laundromat with a long 14-year lease, and clear expansion paths into wholesale, pickup/delivery and dry cleaning.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('laundromat-harlem-low-rent', 'sold', false, 'Laundromat – Absentee, Low Rent, Long Lease', 'Laundromat', 'Harlem', 'NY', 'Manhattan', null, 'Leased', '1,400 SF', 'Exact address disclosed after NDA', 'Absentee-run on a long 15-year lease with low rent. Currently coin and drop-off revenue only.', 'A Harlem laundromat with an exceptional 15-year lease and low rent, trading on coin and drop-off alone — room to add wholesale and delivery.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('laundromat-harlem-absentee', 'sold', false, 'Laundromat – Absentee, Long Lease', 'Laundromat', 'Harlem', 'NY', 'Manhattan', null, 'Leased', '1,100 SF', 'Exact address disclosed after NDA', 'Absentee-run with an 11-year lease. Opportunity to grow via wholesale accounts.', 'An absentee Harlem laundromat with an 11-year lease and upside from adding wholesale accounts.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('barbershop-ues', 'sold', false, 'Barbershop – Long Lease, Low Rent', 'Barbershop', 'Upper East Side', 'NY', 'Manhattan', null, 'Leased', '500 SF', 'Exact address disclosed after NDA', 'Five-chair barbershop with a loyal, established customer base and low rent.', 'A profitable Upper East Side barbershop with five chairs, a loyal clientele, an 8-year lease and low rent.', null, null, null, null, null, (select id from public.brokers where slug = 'edward-lee')),
  ('dry-cleaners-uws', 'sold', false, 'Dry Cleaners – Great Location, Long Lease', 'Dry Cleaners', 'Upper West Side', 'NY', 'Manhattan', null, 'Leased', '500 SF + 500 SF basement', 'Exact address disclosed after NDA', 'Well-located Upper West Side plant with a long operating history.', 'A 30+ year Upper West Side dry cleaner (17 under the current owner) in a prime location, with a 10-year lease.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('wash-fold-drop-store-ues', 'sold', false, 'Wash & Fold Laundry / Drop Store', 'Laundromat', 'Upper East Side', 'NY', 'Manhattan', null, 'Leased', '800 SF + 800 SF basement', 'Exact address disclosed after NDA', '8 washers and 8 dryers. Straightforward wash & fold / drop-store with no wholesale accounts.', 'An Upper East Side wash & fold and drop store, 35 years established, with eight washers and dryers and a 10-year lease — untapped wholesale potential.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('laundromat-washington-heights-absentee-run', 'sold', false, 'Laundromat – Absentee Run', 'Laundromat', 'Washington Heights', 'NY', 'Manhattan', null, 'Leased', '750 SF + 750 SF basement', 'Exact address disclosed after NDA', '31 machines (17 washers, 14 dryers). Absentee-run; rent includes no separate real-estate tax.', 'An absentee-run Washington Heights laundromat with 31 machines and a 10-year lease.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('bagel-shop-cafe-bronx', 'sold', false, 'Bagel Shop / Café – Long Lease, Low Rent', 'Restaurant / Café', 'Bronx', 'NY', 'Bronx', null, 'Leased', '1,500 SF', 'Exact address disclosed after NDA', 'Located in a luxury residential building in an up-and-coming neighborhood. Low rent with no increase for two years and no real-estate tax.', 'A high-volume Bronx bagel shop and café in a luxury residential building, with a long lease and very favorable rent terms.', null, null, null, null, null, (select id from public.brokers where slug = 'edward-lee')),
  ('laundromat-harlem-great-location', 'sold', false, 'Laundromat – Great Location, Long Lease', 'Laundromat', 'Harlem', 'NY', 'Manhattan', 2022, 'Leased', '1,800 SF + 1,800 SF basement', 'Exact address disclosed after NDA', '35 washers and 36 dryers, all new. Walk-in and drop-off only — no commercial accounts yet.', 'A modern, high-performing Harlem laundromat built out about two years ago with all-new equipment, trading on walk-in and drop-off alone — commercial accounts are the obvious next step.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('laundromat-astoria-large', 'sold', false, 'Laundromat – Astoria, Large Space, Long Lease', 'Laundromat', 'Astoria', 'NY', 'Queens', null, 'Leased', '1,800 SF + 1,000 SF basement', 'Exact address disclosed after NDA', '52 machines (26 washers, 26 dryers), about three years old. Upside via hotel, hospital and wholesale accounts.', 'A large Astoria laundromat with 52 newer machines and a fresh 10-year lease, with strong commercial expansion potential.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('dry-cleaners-midtown-east', 'sold', false, 'Dry Cleaners – Great Location', 'Dry Cleaners', 'Midtown East', 'NY', 'Manhattan', null, 'Leased', '400 SF + 400 SF basement', 'Exact address disclosed after NDA', 'Compact Midtown East plant. Growth opportunity through pickup/delivery and online ordering.', 'A well-located Midtown East dry cleaner, 21 years established (16 under the current owner) — room to grow via pickup/delivery and online.', null, null, null, null, null, (select id from public.brokers where slug = 'mary-lee')),
  ('greek-turkish-restaurant-tribeca', 'sold', false, 'Greek / Turkish Restaurant – Tribeca', 'Restaurant / Café', 'Tribeca', 'NY', 'Manhattan', null, 'Leased', '1,000 SF + 1,000 SF basement', 'Exact address disclosed after NDA', 'Well-reviewed (4.5 stars) Mediterranean restaurant with dine-in and delivery. Marketing is the clear growth lever.', 'A well-reviewed Tribeca Greek/Turkish restaurant with a 10-year lease and a 4.5-star reputation across dine-in and delivery.', null, null, null, null, null, (select id from public.brokers where slug = 'edward-lee')),
  ('cafe-pizzeria-ues-flagship', 'sold', false, 'Café / Restaurant / Pizzeria – Upper East Side', 'Restaurant / Café', 'Upper East Side', 'NY', 'Manhattan', 2004, 'Leased', '1,700 SF + 1,700 SF basement', 'Exact address disclosed after NDA', 'Flagship UES café/restaurant/pizzeria. Upside via staffing efficiency and menu diversification.', 'A flagship Upper East Side café, restaurant and pizzeria established in 2004, on a 10-year lease.', null, null, null, null, null, (select id from public.brokers where slug = 'edward-lee'))
on conflict (slug) do nothing;

-- 3. Clear figures + refresh wording on CLOSED deals (one pass) -------------
update public.listings l set
  asking_price = null, cash_flow = null, gross_revenue = null, rent = null, lease_expiration = null,
  description = v.descr
from (values
  ('laundromat-east-harlem-60-machines', 'A large East Harlem laundromat with 60 machines across a 2,000 SF store plus a full 2,000 SF basement. Established roughly four years.'),
  ('laundromat-east-harlem-new-machines', 'A spacious East Harlem laundromat under the current owner for about seven years, with newer machines and an absentee model supported by employee profit sharing.'),
  ('cafe-pizzeria-ues', 'A long-running Upper East Side café, restaurant and pizzeria established in 2004 with a strong pre-pandemic trading history. Sold as the original owners retired.'),
  ('dry-cleaners-lower-east-side', 'A Lower East Side dry cleaner of 7+ years, run partially absentee, serving the surrounding finance workforce.'),
  ('dry-cleaners-bronx-large', 'A 35+ year Bronx dry cleaner enjoying a local monopoly, with a 1,500 SF space and a team of four.'),
  ('laundromat-flushing-full-service', 'A 37-year full-service Queens laundromat on a commuter boulevard, refreshed with 35 nearly-new machines and offering wash/fold and dry cleaning.'),
  ('laundromat-queens-low-rent', 'A 50+ year Queens laundromat with a standout low rent and a 10+ year lease in place — an ideal first business.'),
  ('dry-cleaners-bronx-yankee-stadium', 'A busy Bronx dry cleaner near Yankee Stadium, 40+ years established (12 under the current owner), with a steady local trade.'),
  ('laundromat-washington-heights-absentee', 'An absentee-run Washington Heights laundromat with a long 14-year lease, and clear expansion paths into wholesale, pickup/delivery and dry cleaning.'),
  ('laundromat-harlem-low-rent', 'A Harlem laundromat with an exceptional 15-year lease and low rent, trading on coin and drop-off alone — room to add wholesale and delivery.'),
  ('laundromat-harlem-absentee', 'An absentee Harlem laundromat with an 11-year lease and upside from adding wholesale accounts.'),
  ('barbershop-ues', 'A profitable Upper East Side barbershop with five chairs, a loyal clientele, an 8-year lease and low rent.'),
  ('dry-cleaners-uws', 'A 30+ year Upper West Side dry cleaner (17 under the current owner) in a prime location, with a 10-year lease.'),
  ('wash-fold-drop-store-ues', 'An Upper East Side wash & fold and drop store, 35 years established, with eight washers and dryers and a 10-year lease — untapped wholesale potential.'),
  ('laundromat-washington-heights-absentee-run', 'An absentee-run Washington Heights laundromat with 31 machines and a 10-year lease.'),
  ('bagel-shop-cafe-bronx', 'A high-volume Bronx bagel shop and café in a luxury residential building, with a long lease and very favorable rent terms.'),
  ('laundromat-harlem-great-location', 'A modern, high-performing Harlem laundromat built out about two years ago with all-new equipment, trading on walk-in and drop-off alone — commercial accounts are the obvious next step.'),
  ('laundromat-astoria-large', 'A large Astoria laundromat with 52 newer machines and a fresh 10-year lease, with strong commercial expansion potential.'),
  ('dry-cleaners-midtown-east', 'A well-located Midtown East dry cleaner, 21 years established (16 under the current owner) — room to grow via pickup/delivery and online.'),
  ('greek-turkish-restaurant-tribeca', 'A well-reviewed Tribeca Greek/Turkish restaurant with a 10-year lease and a 4.5-star reputation across dine-in and delivery.'),
  ('cafe-pizzeria-ues-flagship', 'A flagship Upper East Side café, restaurant and pizzeria established in 2004, on a 10-year lease.')
) as v(slug, descr)
where l.slug = v.slug and l.status = 'sold';

-- 4. Make sure each listing is assigned to its broker ----------------------
insert into public.listing_brokers (listing_id, broker_id)
select id, broker_id from public.listings where broker_id is not null
on conflict do nothing;

-- 5. Point photos at the committed images ----------------------------------
with pm(slug, url) as (values
  ('laundromat-bronx-long-lease', '/img/listings/laundromat-bronx-long-lease.jpg'),
  ('laundromat-east-harlem-60-machines', '/img/listings/laundromat-east-harlem-60-machines.jpg'),
  ('laundromat-east-harlem-new-machines', '/img/listings/laundromat-east-harlem-new-machines.jpg'),
  ('cafe-pizzeria-ues', '/img/listings/cafe-pizzeria-ues.jpg'),
  ('dry-cleaners-lower-east-side', '/img/listings/dry-cleaners-lower-east-side.jpg'),
  ('dry-cleaners-bronx-large', '/img/listings/dry-cleaners-bronx-large.jpg'),
  ('laundromat-flushing-full-service', '/img/listings/laundromat-flushing-full-service.jpg'),
  ('laundromat-queens-low-rent', '/img/listings/laundromat-queens-low-rent.jpg'),
  ('dry-cleaners-bronx-yankee-stadium', '/img/listings/dry-cleaners-bronx-yankee-stadium.jpg'),
  ('laundromat-washington-heights-absentee', '/img/listings/laundromat-washington-heights-absentee.jpg'),
  ('laundromat-harlem-low-rent', '/img/listings/laundromat-harlem-low-rent.jpg'),
  ('laundromat-harlem-absentee', '/img/listings/laundromat-harlem-absentee.jpg'),
  ('barbershop-ues', '/img/listings/barbershop-ues.jpg'),
  ('dry-cleaners-uws', '/img/listings/dry-cleaners-uws.jpg'),
  ('wash-fold-drop-store-ues', '/img/listings/wash-fold-drop-store-ues.jpg'),
  ('laundromat-washington-heights-absentee-run', '/img/listings/laundromat-washington-heights-absentee-run.jpg'),
  ('bagel-shop-cafe-bronx', '/img/listings/bagel-shop-cafe-bronx.jpg'),
  ('laundromat-harlem-great-location', '/img/listings/laundromat-harlem-great-location.jpg'),
  ('laundromat-astoria-large', '/img/listings/laundromat-astoria-large.jpg'),
  ('dry-cleaners-midtown-east', '/img/listings/dry-cleaners-midtown-east.jpg'),
  ('greek-turkish-restaurant-tribeca', '/img/listings/greek-turkish-restaurant-tribeca.jpg'),
  ('cafe-pizzeria-ues-flagship', '/img/listings/cafe-pizzeria-ues-flagship.jpg')
)
-- update the primary image where one exists
, upd as (
  update public.listing_images i set url = pm.url
  from pm join public.listings l on l.slug = pm.slug
  where i.listing_id = l.id and i.is_primary
  returning i.listing_id
)
-- insert a primary image for listings that have none
insert into public.listing_images (listing_id, url, caption, is_primary, sort_order)
select l.id, pm.url, l.city || ', ' || coalesce(l.county,''), true, 0
from pm join public.listings l on l.slug = pm.slug
where not exists (select 1 from public.listing_images i where i.listing_id = l.id);
