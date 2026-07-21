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
  BRAND_NAME: 'Your Brokerage, LLC',
  BRAND_TAGLINE: 'Short tagline',
  LOGO_URL: '/img/your-logo.jpg',   // omit to fall back to the brand name as text

  CONTACT_EMAIL: 'broker@example.com',
  CONTACT_PHONE: '(555) 123-4567',
  CONTACT_ADDRESS: '123 Main St, City, ST 00000',
  WEBSITE: 'www.example.com',

  // Home page: intro paragraphs, then one card per service.
  HOME_INTRO: [
    'Opening paragraph for the home page.',
    'A second paragraph. Add as many as you like.',
  ],
  HOME_SERVICES: [
    { title: 'Selling a business', body: ['What you do for sellers.', 'A second paragraph if useful.'] },
    { title: 'Buying a business', body: ['What you do for buyers.'] },
  ],

  ABOUT_HEADING: 'About Your Brokerage, LLC',
  ABOUT: [
    'First paragraph describing the firm — shown in the About Us panel.',
    'Second paragraph. Add as many as you like; each renders as its own <p>.',
  ],
  DISCLAIMER: 'All figures shown are expressed by the seller. All commissions are paid by the seller.',
  SELL_CTA: 'Contact us to list your business',

  // NOTE: brokers are NOT configured here. They're real CMS data — manage them
  // in /admin → Brokers. They appear at /brokers, each with a profile page.
};
