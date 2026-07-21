// Local/demo config. Left as placeholders => DEMO MODE (bundled sample data,
// no backend). Copy your real Supabase values in when you're ready to go live.
// This file is gitignored; commit config.example.js instead.
window.BROKERAGE_CONFIG = {
  SUPABASE_URL: 'https://xwzlmpppdgbkywmrpvqf.supabase.co',
  // Supabase's new-style PUBLISHABLE key (replaces the old "anon" JWT).
  // Safe to ship in the browser and to commit — RLS is the real boundary.
  // Never put the sb_secret_... / service_role key here.
  SUPABASE_ANON_KEY: 'sb_publishable_htM7IYeQkyaGWUXY_CujsA_x4f2q2fh',

  BRAND_NAME: 'NGU Business Real Estate, LLC',
  BRAND_TAGLINE: 'A family-owned residential and commercial brokerage',
  LOGO_URL: '/img/ngu-logo.jpg',

  CONTACT_EMAIL: 'ngumarylee@gmail.com',
  CONTACT_PHONE: '718-737-6899',
  CONTACT_ADDRESS: '3225 Johnson Ave 5F, Bronx, NY 10463',
  WEBSITE: 'www.ngurealty.com',

  // Firm description, from the existing NGU site.
  ABOUT: 'NGU Business Real Estate, LLC is a family-owned residential and commercial brokerage. ' +
         'Our primary focus is small to mid-sized businesses in and around the NYC area. ' +
         'We help existing business owners sell their business and prospective buyers find a ' +
         'business that fits their needs.',

  // Shown on listings and in the footer.
  DISCLAIMER: 'All figures shown are expressed by the seller. All commissions are paid by the seller.',
  SELL_CTA: 'Contact us to list your business',

  // NOTE: brokers are NOT configured here. They're real CMS data — manage them
  // in /admin → Brokers. They appear at /brokers, each with a profile page.
};
