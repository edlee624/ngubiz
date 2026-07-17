// Local/demo config. Left as placeholders => DEMO MODE (bundled sample data,
// no backend). Copy your real Supabase values in when you're ready to go live.
// This file is gitignored; commit config.example.js instead.
window.BROKERAGE_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT-ref.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-PUBLIC-KEY',

  BRAND_NAME: 'NGU Business Real Estate, LLC',
  BRAND_TAGLINE: 'A family-owned brokerage specializing in small to mid-sized businesses in and around NYC',
  CONTACT_EMAIL: 'ngumarylee@gmail.com',
  CONTACT_PHONE: '718-737-6899',
  CONTACT_ADDRESS: '3225 Johnson Ave 5F, Bronx, NY 10463',
  WEBSITE: 'www.ngurealty.com',

  // Team shown on the public "About / Our Team" section.
  TEAM: [
    {
      name: 'Mary Lee',
      title: 'Licensed NYS Commercial & Residential Broker',
      phone: '718-737-6899',
      email: 'ngumarylee@gmail.com',
      bio: 'Mary brings backgrounds in finance, international relations, and small business management. She previously spent 10+ years with Korea’s Ministry of Foreign Affairs and three years at the United Nations, and remains active in the financial markets. She leads NGU’s business brokerage practice across the NYC area.',
    },
    {
      name: 'Edward Lee',
      title: 'Licensed NYS Salesperson',
      phone: '347-614-0624',
      email: 'nguedwardlee@gmail.com',
      bio: 'Edward holds a finance degree from Carnegie Mellon and was formerly a management consultant serving major investment banks. He builds AI analytics platforms and operates a professional job board and salon CRM software, bringing a data-driven approach to valuing and marketing businesses.',
    },
  ],
};
