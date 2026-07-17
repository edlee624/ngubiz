# Business Brokerage CMS

A public **businesses-for-sale** listings site (styled after BizBuySell) plus a
private **broker admin** for managing listings, leads, and NDA-gated documents.

Same stack as the rest of the portfolio: **static SPA + Supabase + Vercel** —
no build step, the browser talks to Postgres directly, and Row Level Security
(RLS) is the real boundary.

## What it does

**Public site** (`/`)
- Listings grid with search + industry/location filters
- Listing detail: image gallery, financials panel (asking price, cash flow,
  gross revenue, EBITDA, FF&E, inventory, rent…), full description, detailed
  info table, and a **"Listed by"** card for the assigned broker
- **Broker profiles** (`/brokers`, `/broker/<slug>`) — bio, contact, and the
  businesses that broker represents (current + recently sold)
- **Contact form** on every listing → creates a lead, routed to that listing's broker
- **"Sell a business"** form → creates a seller lead
- **NDA flow**: buyers sign a confidentiality agreement to unlock confidential
  documents (CIM, financials)

**Broker admin** (`/admin`)
- Sign in (Supabase Auth)
- **Listings** — full CRUD, photos, NDA-gated documents, and broker assignment
- **Brokers** — full CRUD; drives the public profile pages and inquiry routing
- **Leads** — a pipeline board (New → Contacted → NDA Signed → Qualified →
  Negotiating → Closed) covering buyers, sellers, and general inquiries,
  each showing its listing and assigned broker
- **NDAs** — record of everyone who signed, and for which listing

> **Setting this up on fresh GitHub / Vercel / Supabase accounts?**
> See **[SETUP.md](SETUP.md)** — accounts live under `nguedwardlee@gmail.com`,
> separate from the `edlee624@gmail.com` accounts used by the other repos.

## Run locally (demo mode)

With `public/config.js` left on its placeholder values, the site runs in
**demo mode** — bundled sample listings, no backend, writes simulated in memory.

```bash
npm run dev          # npx serve public -p 3000  → http://localhost:3000
```

Admin is at `/admin.html` — in demo mode, enter anything to sign in.

## Go live on Supabase

1. **Create a Supabase project**, then in the SQL editor run **in order**:
   - `supabase/migrations/0001_init.sql`    (schema + RLS + public RPCs)
   - `supabase/migrations/0002_brokers.sql` (brokers + listing/lead attribution)
   - `supabase/seed.sql`                    (optional: brokers + listing catalogue)
2. **Copy your keys** into `public/config.js`:
   ```js
   window.BROKERAGE_CONFIG = {
     SUPABASE_URL: 'https://<your-ref>.supabase.co',
     SUPABASE_ANON_KEY: '<your-anon-public-key>',
     BRAND_NAME: 'Your Brokerage',
     BRAND_TAGLINE: '…',
     CONTACT_EMAIL: 'you@example.com',
     CONTACT_PHONE: '(555) 123-4567',
   };
   ```
   The URL + anon key are **public** values (safe in the browser) — they're
   gated by RLS. Never put the `service_role` key here. This is why `config.js`
   **is committed**: the static Vercel deploy needs it at runtime.
3. **Create your admin login**: in Supabase → Authentication → add a user with
   your email/password. The first user to sign up is auto-promoted to `admin`
   (see the `handle_new_user` trigger); everyone after defaults to `staff`.
4. **Photos & documents**: create a **public** Storage bucket for listing photos
   and paste the public URLs in the admin. For confidential documents, use a
   separate bucket and paste the file URL — release is gated by the NDA form.

## Deploy (Vercel)

```bash
vercel            # uses vercel.json (static, SPA rewrites)
```
Set the same config in `public/config.js` before deploying (or wire it through
your own env injection). `/admin` is `noindex`.

## Architecture notes

- **`public/js/api.js`** is the single data layer. It auto-detects config: real
  keys → Supabase; placeholders → demo data (`public/js/demo-data.js`).
- **`tools/build-catalogue.mjs`** is the source of truth for the seeded brokers +
  listings. It emits BOTH `public/js/demo-data.js` and `supabase/seed.sql` — edit
  the script and re-run `node tools/build-catalogue.mjs`; never hand-edit the two
  generated files. (Once live, manage everything in `/admin` instead.)
- **Broker attribution**: each listing has a `broker_id`. Inquiries resolve their
  broker as: explicit `p_broker_id` (broker profile form) → else the listing's
  broker → else unassigned. `submit_inquiry` enforces this server-side.
- **Public writes never touch tables directly.** Inquiries and NDA signatures go
  through `SECURITY DEFINER` RPCs (`submit_inquiry`, `sign_nda`) so the anon
  client can't read leads, NDAs, or draft listings.
- **Visibility rule**: a listing is publicly visible only when its status is
  `active`, `under_offer`, or `sold`. `draft` and `withdrawn` are staff-only.

## Security caveat (documents)

In v1, released documents are delivered as URLs after the NDA form is submitted.
This gates the *display* of the links but is not cryptographically enforced. For
stronger control, move to short-lived Supabase **signed URLs** minted by an Edge
Function that verifies an NDA row exists for the requester — a good next step.
