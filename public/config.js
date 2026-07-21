// Local/demo config. Left as placeholders => DEMO MODE (bundled sample data,
// no backend). Copy your real Supabase values in when you're ready to go live.
// This file is gitignored; commit config.example.js instead.
window.BROKERAGE_CONFIG = {
  SUPABASE_URL: 'https://xwzlmpppdgbkywmrpvqf.supabase.co',
  // Paste the anon / public key here (Supabase → Settings → API → Project API keys).
  // It's a long JWT starting with "eyJ". Safe in the browser — RLS is the boundary.
  // Never the service_role key. Site stays in DEMO MODE until this is filled in.
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',

  BRAND_NAME: 'NGU Business Real Estate, LLC',
  BRAND_TAGLINE: 'A family-owned brokerage specializing in small to mid-sized businesses in and around NYC',
  CONTACT_EMAIL: 'ngumarylee@gmail.com',
  CONTACT_PHONE: '718-737-6899',
  CONTACT_ADDRESS: '3225 Johnson Ave 5F, Bronx, NY 10463',
  WEBSITE: 'www.ngurealty.com',

  // NOTE: brokers are NOT configured here. They're real CMS data — manage them
  // in /admin → Brokers. They appear at /brokers, each with a profile page.
};
