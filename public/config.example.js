// Copy this file to config.js (same folder) and fill in your Supabase project
// values. Both are PUBLIC values (safe to ship to the browser) — the anon key
// is gated by the Row Level Security policies in supabase/migrations.
// Never put the service_role / secret key here.
//
// Leave the values as the YOUR-... placeholders to run the site in DEMO MODE
// (bundled sample listings, no backend) so you can preview the design locally.
window.BROKERAGE_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-ref.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',

  // Branding shown across the public site + admin
  BRAND_NAME: 'NGU Business Real Estate, LLC',
  BRAND_TAGLINE: 'A family-owned brokerage specializing in small to mid-sized businesses in and around NYC',
  CONTACT_EMAIL: 'broker@example.com',
  CONTACT_PHONE: '(555) 123-4567',
  CONTACT_ADDRESS: '123 Main St, City, ST 00000',
  WEBSITE: 'www.example.com',

  // NOTE: brokers are NOT configured here. They're real CMS data — manage them
  // in /admin → Brokers. They appear at /brokers, each with a profile page.
};
