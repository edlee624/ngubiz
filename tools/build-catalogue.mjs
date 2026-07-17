// Canonical NGU Business Real Estate catalogue — brokers + listings.
//
// SOURCE OF TRUTH. Emits BOTH:
//   public/js/demo-data.js  (preview / demo mode)
//   supabase/seed.sql       (bootstrap a fresh Supabase project)
// Never hand-edit those two files — edit this one and re-run:
//   node tools/build-catalogue.mjs
//
// Once you're live on Supabase, manage listings/brokers in /admin instead;
// the seed only bootstraps an empty database.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DEMO = join(ROOT, 'public', 'js', 'demo-data.js');
const OUT_SEED = join(ROOT, 'supabase', 'seed.sql');

// ---------------------------------------------------------------- brokers ---
const BROKERS = [
  { slug:'mary-lee', name:'Mary Lee', title:'Licensed NYS Commercial & Residential Broker',
    phone:'718-737-6899', email:'ngumarylee@gmail.com', sort:0,
    bio:'Mary brings backgrounds in finance, international relations, and small business management. She previously spent 10+ years with Korea’s Ministry of Foreign Affairs and three years at the United Nations, and remains active in the financial markets. She leads NGU’s business brokerage practice across the NYC area, guiding owners through valuation, confidential marketing, and closing.' },
  { slug:'edward-lee', name:'Edward Lee', title:'Licensed NYS Salesperson',
    phone:'347-614-0624', email:'nguedwardlee@gmail.com', sort:1,
    bio:'Edward holds a finance degree from Carnegie Mellon and was formerly a management consultant serving major investment banks. He builds AI analytics platforms and operates a professional job board and salon CRM software, bringing a data-driven approach to valuing and marketing businesses.' },
];

// Who fronts what: Mary leads the laundromat / dry-cleaning practice;
// Edward covers food service and personal care.
const brokerFor = (category) =>
  (category === 'Restaurant / Café' || category === 'Barbershop') ? 'edward-lee' : 'mary-lee';

// --------------------------------------------------------------- listings ---
// status: 'active' | 'sold'. price/cf/rev/rent in dollars (rent monthly).
const L = [
  { slug:'laundromat-bronx-long-lease', status:'active', featured:true,
    title:'Laundromat – Large Space, Long Lease', headline:'Established 20+ years · primarily wholesale · 10-year lease remaining',
    category:'Laundromat', city:'Bronx', county:'Bronx', price:299000, cf:120000, rev:600000, rent:9700,
    sf:'3,500 SF', lease:'10-year lease remaining', established:null,
    facilities:'50 washers and 50 dryers. Primarily a wholesale operation with strong recurring commercial accounts.',
    blurb:'A large, well-established Bronx laundromat operating for over 20 years with a primarily wholesale model that drives dependable, high-margin revenue. Roughly $600k in annual revenue and $120k in owner cash flow, with a long 10-year lease in place — a turnkey opportunity with room to grow the retail and drop-off side.' },

  { slug:'laundromat-east-harlem-60-machines', status:'sold',
    title:'Large Laundromat – East Harlem', headline:'60 machines · 2,000 SF plus full basement',
    category:'Laundromat', city:'East Harlem', county:'Manhattan', price:null, cf:null, rev:null, rent:null,
    sf:'2,000 SF + 2,000 SF basement', lease:null, established:null,
    facilities:'60 machines (30 washers, 30 dryers). Prior laundry experience preferred for this operation.',
    blurb:'A large East Harlem laundromat with 60 machines across a 2,000 SF store plus a full 2,000 SF basement. Established roughly four years.' },

  { slug:'laundromat-east-harlem-new-machines', status:'sold',
    title:'Laundromat – New Machines, Large Space', headline:'Absentee-run · employee profit sharing',
    category:'Laundromat', city:'East Harlem', county:'Manhattan', price:null, cf:null, rev:null, rent:null,
    sf:'2,000 SF + 2,000 SF basement', lease:null, established:null,
    facilities:'New machines installed about three years ago. Absentee-run with an employee profit-sharing arrangement.',
    blurb:'A spacious East Harlem laundromat under the current owner for about seven years, with newer machines and an absentee model supported by employee profit sharing.' },

  { slug:'cafe-pizzeria-ues', status:'sold',
    title:'Café / Restaurant / Pizzeria – Upper East Side', headline:'Established 2004 · pre-pandemic revenue ~$3MM',
    category:'Restaurant / Café', city:'Upper East Side', county:'Manhattan', price:null, cf:null, rev:3000000, rent:null,
    sf:'1,700 SF + 1,700 SF basement', lease:null, established:2004,
    facilities:'Full café/restaurant/pizzeria build-out. Original owners retiring.',
    blurb:'A long-running Upper East Side café, restaurant and pizzeria established in 2004 with pre-pandemic revenue near $3MM. Sold as the original owners retired.' },

  { slug:'dry-cleaners-lower-east-side', status:'sold',
    title:'Dry Cleaners – Lower East Side', headline:'Partial absentee · finance-district clientele',
    category:'Dry Cleaners', city:'Lower East Side', county:'Manhattan', price:null, cf:null, rev:null, rent:4600,
    sf:null, lease:null, established:null,
    facilities:'Partial absentee operation serving a clientele of nearby finance employees.',
    blurb:'A Lower East Side dry cleaner of 7+ years, run partially absentee, serving the surrounding finance workforce.' },

  { slug:'dry-cleaners-bronx-large', status:'sold',
    title:'Dry Cleaners – Large Space', headline:'35+ years · the only cleaner in the area',
    category:'Dry Cleaners', city:'Bronx', county:'Bronx', price:null, cf:null, rev:null, rent:null,
    sf:'1,500 SF', lease:null, established:null,
    facilities:'1,500 SF plant with 4 staff. Effectively the only dry cleaner serving the immediate area.',
    blurb:'A 35+ year Bronx dry cleaner enjoying a local monopoly, with a 1,500 SF space and a team of four.' },

  { slug:'laundromat-flushing-full-service', status:'sold',
    title:'Laundromat – Full Service, New Machines', headline:'37 years established · commuter boulevard location',
    category:'Laundromat', city:'Flushing', county:'Queens', price:null, cf:null, rev:null, rent:null,
    sf:null, lease:null, established:null,
    facilities:'35 new machines (under a year old). Full service including wash/fold and dry cleaning, on a busy commuter boulevard.',
    blurb:'A 37-year full-service Queens laundromat on a commuter boulevard, refreshed with 35 nearly-new machines and offering wash/fold and dry cleaning.' },

  { slug:'laundromat-queens-low-rent', status:'sold',
    title:'Laundromat – Long Lease, Low Rent', headline:'50+ years · great starter business',
    category:'Laundromat', city:'Queens', county:'Queens', price:139000, cf:84000, rev:348000, rent:2800,
    sf:'600 SF', lease:'10+ year lease', established:null,
    facilities:'Compact, efficient store with very low rent — an ideal first business.',
    blurb:'A 50+ year Queens laundromat with a standout low rent of $2,800 and a 10+ year lease. About $348k revenue and $84k cash flow — a great starter opportunity.' },

  { slug:'dry-cleaners-bronx-yankee-stadium', status:'sold',
    title:'Dry Cleaners – Close to Yankee Stadium', headline:'40+ years established · busy Bronx corridor',
    category:'Dry Cleaners', city:'Bronx', county:'Bronx', price:null, cf:100000, rev:400000, rent:3200,
    sf:'900 SF + 900 SF basement', lease:'7 years + 4-year option', established:null,
    facilities:'Established plant near Yankee Stadium with a long operating history.',
    blurb:'A busy Bronx dry cleaner near Yankee Stadium, 40+ years established (12 under the current owner), with ~$400k revenue and ~$100k cash flow.' },

  { slug:'laundromat-washington-heights-absentee', status:'sold',
    title:'Laundromat – Absentee, Long Lease', headline:'14-year lease · expansion upside',
    category:'Laundromat', city:'Washington Heights', county:'Manhattan', price:399000, cf:118000, rev:455000, rent:8539,
    sf:'1,000 SF', lease:'14-year lease', established:null,
    facilities:'Absentee-run with a long 14-year lease. Upside via wholesale, pickup/delivery, and dry cleaning.',
    blurb:'An absentee-run Washington Heights laundromat with a 14-year lease, ~$455k revenue and ~$118k cash flow, and clear expansion paths into wholesale, pickup/delivery and dry cleaning.' },

  { slug:'laundromat-harlem-low-rent', status:'sold',
    title:'Laundromat – Absentee, Low Rent, Long Lease', headline:'15-year lease · coin and drop-off only',
    category:'Laundromat', city:'Harlem', county:'Manhattan', price:450000, cf:102000, rev:367000, rent:4637,
    sf:'1,400 SF', lease:'15-year lease', established:null,
    facilities:'Absentee-run on a long 15-year lease with low rent. Currently coin and drop-off revenue only.',
    blurb:'A Harlem laundromat with an exceptional 15-year lease and low rent, ~$367k revenue and ~$102k cash flow from coin and drop-off alone — room to add wholesale and delivery.' },

  { slug:'laundromat-harlem-absentee', status:'sold',
    title:'Laundromat – Absentee, Long Lease', headline:'11-year lease · wholesale upside',
    category:'Laundromat', city:'Harlem', county:'Manhattan', price:399000, cf:91000, rev:360000, rent:4819,
    sf:'1,100 SF', lease:'11-year lease', established:null,
    facilities:'Absentee-run with an 11-year lease. Opportunity to grow via wholesale accounts.',
    blurb:'An absentee Harlem laundromat with an 11-year lease, ~$360k revenue and ~$91k cash flow, with upside from adding wholesale.' },

  { slug:'barbershop-ues', status:'sold',
    title:'Barbershop – Long Lease, Low Rent', headline:'5 chairs · established Upper East Side clientele',
    category:'Barbershop', city:'Upper East Side', county:'Manhattan', price:95000, cf:84000, rev:119000, rent:2850,
    sf:'500 SF', lease:'8-year lease', established:null,
    facilities:'Five-chair barbershop with a loyal, established customer base and low rent.',
    blurb:'A profitable Upper East Side barbershop with five chairs, a loyal clientele, an 8-year lease and low rent — ~$119k revenue on ~$84k cash flow.' },

  { slug:'dry-cleaners-uws', status:'sold',
    title:'Dry Cleaners – Great Location, Long Lease', headline:'30+ years established · Upper West Side',
    category:'Dry Cleaners', city:'Upper West Side', county:'Manhattan', price:79000, cf:70000, rev:270000, rent:6600,
    sf:'500 SF + 500 SF basement', lease:'10-year lease', established:null,
    facilities:'Well-located Upper West Side plant with a long operating history.',
    blurb:'A 30+ year Upper West Side dry cleaner (17 under the current owner) in a prime location, with a 10-year lease, ~$270k revenue and ~$70k cash flow.' },

  { slug:'wash-fold-drop-store-ues', status:'sold',
    title:'Wash & Fold Laundry / Drop Store', headline:'Upper East Side · simple drop-store model',
    category:'Laundromat', city:'Upper East Side', county:'Manhattan', price:99000, cf:70000, rev:200000, rent:5600,
    sf:'800 SF + 800 SF basement', lease:'10-year lease', established:null,
    facilities:'8 washers and 8 dryers. Straightforward wash & fold / drop-store with no wholesale accounts.',
    blurb:'An Upper East Side wash & fold and drop store, 35 years established, with 8 washers/dryers, a 10-year lease, ~$200k revenue and ~$70k cash flow — untapped wholesale potential.' },

  { slug:'laundromat-washington-heights-absentee-run', status:'sold',
    title:'Laundromat – Absentee Run', headline:'31 machines · no real-estate tax',
    category:'Laundromat', city:'Washington Heights', county:'Manhattan', price:249000, cf:70000, rev:310000, rent:7000,
    sf:'750 SF + 750 SF basement', lease:'10-year lease', established:null,
    facilities:'31 machines (17 washers, 14 dryers). Absentee-run; rent includes no separate real-estate tax.',
    blurb:'An absentee-run Washington Heights laundromat with 31 machines, a 10-year lease and ~$310k revenue on ~$70k cash flow.' },

  { slug:'bagel-shop-cafe-bronx', status:'sold',
    title:'Bagel Shop / Café – Long Lease, Low Rent', headline:'Luxury residential building · ~$936k revenue',
    category:'Restaurant / Café', city:'Bronx', county:'Bronx', price:399000, cf:null, rev:936000, rent:4600,
    sf:'1,500 SF', lease:'10 years + 5-year option', established:null,
    facilities:'Located in a luxury residential building in an up-and-coming neighborhood. Low rent with no increase for two years and no real-estate tax.',
    blurb:'A high-volume Bronx bagel shop and café in a luxury residential building, ~$936k in revenue, with a long lease and very favorable rent terms.' },

  { slug:'laundromat-harlem-great-location', status:'sold',
    title:'Laundromat – Great Location, Long Lease', headline:'All-new equipment · ~$135k cash flow',
    category:'Laundromat', city:'Harlem', county:'Manhattan', price:749000, cf:135000, rev:445000, rent:14500,
    sf:'1,800 SF + 1,800 SF basement', lease:'10 years + 5-year option', established:2022,
    facilities:'35 washers and 36 dryers, all new. Walk-in and drop-off only — no commercial accounts yet.',
    blurb:'A modern, high-performing Harlem laundromat built out about two years ago with all-new equipment, ~$445k revenue and ~$135k cash flow from walk-in/drop-off alone — commercial accounts are the obvious next step.' },

  { slug:'laundromat-astoria-large', status:'sold',
    title:'Laundromat – Astoria, Large Space, Long Lease', headline:'52 newer machines · expansion potential',
    category:'Laundromat', city:'Astoria', county:'Queens', price:399000, cf:120000, rev:315600, rent:5400,
    sf:'1,800 SF + 1,000 SF basement', lease:'New 10-year lease', established:null,
    facilities:'52 machines (26 washers, 26 dryers), about three years old. Upside via hotel, hospital and wholesale accounts.',
    blurb:'A large Astoria laundromat with 52 newer machines, a fresh 10-year lease, ~$315k revenue and ~$120k cash flow, with strong commercial expansion potential.' },

  { slug:'dry-cleaners-midtown-east', status:'sold',
    title:'Dry Cleaners – Great Location', headline:'Midtown East · pickup/delivery upside',
    category:'Dry Cleaners', city:'Midtown East', county:'Manhattan', price:99000, cf:95000, rev:394000, rent:7400,
    sf:'400 SF + 400 SF basement', lease:'5 years + 5-year option', established:null,
    facilities:'Compact Midtown East plant. Growth opportunity through pickup/delivery and online ordering.',
    blurb:'A well-located Midtown East dry cleaner, 21 years established (16 under the current owner), with ~$394k revenue and ~$95k cash flow — room to grow via pickup/delivery and online.' },

  { slug:'greek-turkish-restaurant-tribeca', status:'sold',
    title:'Greek / Turkish Restaurant – Tribeca', headline:'4.5-star rated · dine-in and delivery',
    category:'Restaurant / Café', city:'Tribeca', county:'Manhattan', price:179000, cf:null, rev:720000, rent:10000,
    sf:'1,000 SF + 1,000 SF basement', lease:'10-year lease', established:null,
    facilities:'Well-reviewed (4.5 stars) Mediterranean restaurant with dine-in and delivery. Marketing is the clear growth lever.',
    blurb:'A well-reviewed Tribeca Greek/Turkish restaurant with ~$720k revenue, a 10-year lease and a 4.5-star reputation across dine-in and delivery.' },

  { slug:'cafe-pizzeria-ues-flagship', status:'sold',
    title:'Café / Restaurant / Pizzeria – Upper East Side', headline:'Established 2004 · ~$3MM revenue',
    category:'Restaurant / Café', city:'Upper East Side', county:'Manhattan', price:999000, cf:280000, rev:3000000, rent:29200,
    sf:'1,700 SF + 1,700 SF basement', lease:'10-year lease', established:2004,
    facilities:'Flagship UES café/restaurant/pizzeria. Upside via staffing efficiency and menu diversification.',
    blurb:'A flagship Upper East Side café, restaurant and pizzeria established in 2004, with ~$3MM revenue and ~$280k cash flow on a 10-year lease.' },
];

// ------------------------------------------------------- placeholder art ---
const HUE = { 'Laundromat':205, 'Dry Cleaners':175, 'Restaurant / Café':20, 'Barbershop':265 };
const HEX = { 'Laundromat':'1d6fb8', 'Dry Cleaners':'188f8f', 'Restaurant / Café':'b7791f', 'Barbershop':'5b4b9f' };

function svg(label, hue, sub) {
  const s = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='800'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='hsl(${hue},45%,40%)'/><stop offset='1' stop-color='hsl(${(hue + 40) % 360},50%,26%)'/></linearGradient></defs><rect width='1200' height='800' fill='url(#g)'/><text x='50%' y='47%' fill='rgba(255,255,255,.95)' font-family='Georgia,serif' font-size='60' font-weight='700' text-anchor='middle'>${label}</text><text x='50%' y='58%' fill='rgba(255,255,255,.7)' font-family='Arial,sans-serif' font-size='28' text-anchor='middle'>${sub}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
}
function avatar(name, hue) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('');
  const s = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='400' height='400' fill='hsl(${hue},35%,24%)'/><text x='50%' y='58%' fill='#fff' font-family='Georgia,serif' font-size='150' font-weight='700' text-anchor='middle'>${initials}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
}

// ------------------------------------------------------------ build demo ---
const demoBrokers = BROKERS.map((b) => ({
  id: 'ngu-broker-' + b.slug, slug: b.slug, name: b.name, title: b.title,
  phone: b.phone, email: b.email, bio: b.bio,
  photo_url: avatar(b.name, 212), is_active: true, sort_order: b.sort,
}));

const demoListings = L.map((x) => {
  const hue = HUE[x.category] || 210;
  return {
    id: 'ngu-' + x.slug, slug: x.slug, status: x.status, is_featured: !!x.featured,
    broker_id: 'ngu-broker-' + brokerFor(x.category),
    title: x.title, headline: x.headline || null, category: x.category,
    city: x.city, state: 'NY', county: x.county || null,
    asking_price: x.price, cash_flow: x.cf, gross_revenue: x.rev, ebitda: null,
    ffe: null, inventory: null, real_estate_value: null, rent: x.rent,
    is_ffe_included: true, is_inventory_included: true, seller_financing: false,
    established_year: x.established || null, employees: null,
    real_estate: 'Leased', building_sf: x.sf || null, lease_expiration: x.lease || null,
    is_franchise: false, location_note: 'Exact address disclosed after NDA',
    reason_for_selling: null, support_training: null, growth_expansion: null,
    competition: null, facilities: x.facilities || null,
    description: x.blurb,
    documents: x.status === 'active' ? [
      { id: 'doc-' + x.slug, name: 'Confidential Information Memorandum (CIM)', file_url: '#demo-cim', requires_nda: true, is_available: true },
      { id: 'doc2-' + x.slug, name: 'Financials Summary', file_url: '#demo-fin', requires_nda: true, is_available: true },
    ] : [],
    listing_images: [
      { url: svg(x.category, hue, x.city + ', ' + x.county), is_primary: true, sort_order: 0 },
      { url: svg(x.category, hue + 15, 'Interior'), sort_order: 1 },
      { url: svg(x.category, hue + 30, 'Equipment'), sort_order: 2 },
    ],
  };
});

writeFileSync(OUT_DEMO, `// AUTO-GENERATED by tools/build-catalogue.mjs — do not hand-edit.
// Real NGU Business Real Estate catalogue, used when Supabase isn't configured
// (DEMO MODE). Replaced entirely by live Supabase data once config.js has keys.
window.DEMO_BROKERS = ${JSON.stringify(demoBrokers, null, 2)};

window.DEMO_LISTINGS = ${JSON.stringify(demoListings, null, 2)};
`);

// ------------------------------------------------------------ build seed ---
const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const n = (v) => (v == null ? 'null' : Number(v));
const b = (v) => (v ? 'true' : 'false');

let sql = `-- AUTO-GENERATED by tools/build-catalogue.mjs — do not hand-edit.
-- NGU Business Real Estate catalogue: brokers + listings.
-- Run AFTER 0001_init.sql and 0002_brokers.sql on a fresh project.
-- Photos use placeholder URLs (placehold.co); replace them from the admin console.

`;

for (const x of BROKERS) {
  sql += `insert into public.brokers (slug, name, title, phone, email, bio, photo_url, is_active, sort_order)
values (${q(x.slug)}, ${q(x.name)}, ${q(x.title)}, ${q(x.phone)}, ${q(x.email)}, ${q(x.bio)},
  ${q('https://placehold.co/400x400/10243e/ffffff?text=' + encodeURIComponent(x.name.split(' ').map((w) => w[0]).join('')))}, true, ${n(x.sort)})
on conflict (slug) do nothing;

`;
}

for (const x of L) {
  sql += `insert into public.listings (slug, status, is_featured, title, headline, category, city, state, county,
  asking_price, cash_flow, gross_revenue, rent, established_year, real_estate, building_sf, lease_expiration,
  location_note, facilities, description, broker_id)
values (${q(x.slug)}, ${q(x.status)}, ${b(x.featured)}, ${q(x.title)}, ${q(x.headline)}, ${q(x.category)}, ${q(x.city)}, 'NY', ${q(x.county)},
  ${n(x.price)}, ${n(x.cf)}, ${n(x.rev)}, ${n(x.rent)}, ${n(x.established)}, 'Leased', ${q(x.sf)}, ${q(x.lease)},
  'Exact address disclosed after NDA', ${q(x.facilities)}, ${q(x.blurb)},
  (select id from public.brokers where slug = ${q(brokerFor(x.category))}))
on conflict (slug) do nothing;
with l as (select id from public.listings where slug = ${q(x.slug)})
insert into public.listing_images (listing_id, url, caption, is_primary, sort_order)
select l.id, v.url, v.caption, v.is_primary, v.sort_order from l, (values
  ('https://placehold.co/1200x800/${HEX[x.category] || '1d6fb8'}/ffffff?text=${encodeURIComponent(x.category)}', ${q(x.city + ', ' + x.county)}, true, 0)
) as v(url, caption, is_primary, sort_order)
where not exists (select 1 from public.listing_images i where i.listing_id = l.id);
`;
  if (x.status === 'active') {
    sql += `with l as (select id from public.listings where slug = ${q(x.slug)})
insert into public.documents (listing_id, name, file_url, requires_nda, is_available, sort_order)
select l.id, v.name, v.url, true, true, v.so from l, (values
  ('Confidential Information Memorandum (CIM)', 'https://example.com/replace-with-storage-url.pdf', 0),
  ('Financials Summary', 'https://example.com/replace-with-storage-url-2.pdf', 1)
) as v(name, url, so)
where not exists (select 1 from public.documents d where d.listing_id = l.id);
`;
  }
  sql += '\n';
}

writeFileSync(OUT_SEED, sql);
console.log(`Wrote ${demoBrokers.length} brokers + ${demoListings.length} listings → demo-data.js, seed.sql`);
