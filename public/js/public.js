// Public site: listings grid + listing detail, contact form, NDA-gated docs.
(function () {
  const BK = window.BK, fmt = BK.fmt;
  const app = document.getElementById('app');
  const cfg = BK.config;
  let ALL = [];            // cached live listings
  let BROKERS = [];        // cached active brokers

  // ---------- utilities ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }

  // A configured-but-not-yet-migrated project is the most likely failure during
  // setup, so name it explicitly instead of a generic "couldn't load".
  function dataErrorHTML(e) {
    const msg = String((e && e.message) || e || '');
    // PGRST205 = missing table; PGRST200 = missing relationship (a migration
    // added since the schema was last applied).
    const noSchema = /Could not find the table|PGRST205|schema cache/i.test(msg);
    const noRelation = /Could not find a relationship|PGRST200/i.test(msg);
    if (noSchema || noRelation) {
      return `<div class="wrap"><div class="empty">
        <h2>Database needs updating</h2>
        <p>${noSchema ? "Connected to Supabase, but the tables don't exist."
                      : 'Connected to Supabase, but the schema is behind the app.'}</p>
        <p class="muted">Run the migrations in <code>supabase/migrations/</code> that you haven't applied yet
        (or <code>supabase/all_in_one.sql</code> on an empty project), then reload.</p>
      </div></div>`;
    }
    return `<div class="wrap"><div class="empty">
      <h2>Couldn't load listings</h2>
      <p class="muted">${esc(msg)}</p>
    </div></div>`;
  }

  function primaryImage(l) {
    const imgs = l.listing_images || [];
    const p = imgs.find((i) => i.is_primary) || imgs[0];
    return p ? p.url : null;
  }

  // Human-friendly listing reference, e.g. "NGU-2026-09-1". Falls back to the
  // older NGU-#### number, then null (pre-migration / demo data) so callers can
  // filter it out.
  function refCode(l) {
    if (!l) return null;
    if (l.ref_code) return l.ref_code;
    return l.ref_no != null ? 'NGU-' + l.ref_no : null;
  }

  function navigate(path) {
    history.pushState({}, '', path);
    render();
  }

  // ---------- branding ----------
  function applyBranding() {
    if (cfg.BRAND_NAME) {
      document.querySelectorAll('#brand-name, #footer-brand').forEach((e) => (e.textContent = cfg.BRAND_NAME));
      document.title = 'Businesses for Sale — ' + cfg.BRAND_NAME;
    }
    // Logo replaces the wordmark when one is configured.
    const logo = document.getElementById('brand-logo');
    if (logo && cfg.LOGO_URL) {
      logo.src = cfg.LOGO_URL;
      logo.alt = cfg.BRAND_NAME || 'Home';
      logo.classList.remove('hidden');
      // If the file is missing, fall back to the text wordmark rather than a broken image.
      logo.addEventListener('error', () => {
        logo.classList.add('hidden');
        document.getElementById('brand-name').classList.remove('hidden');
      });
      document.getElementById('brand-name').classList.add('hidden');
    }

    const fd = document.getElementById('footer-disclaimer');
    if (fd && cfg.DISCLAIMER) fd.textContent = cfg.DISCLAIMER;

    const fc = document.getElementById('footer-contact');
    if (fc) {
      const bits = [cfg.CONTACT_ADDRESS, cfg.CONTACT_PHONE, cfg.CONTACT_EMAIL, cfg.WEBSITE].filter(Boolean);
      fc.textContent = bits.join('  ·  ');
    }
    document.getElementById('year').textContent = '2026';
    if (BK.isDemo) document.getElementById('demo-banner').classList.remove('hidden');
  }

  // ---------- HOME (/) ----------
  async function renderHomePage() {
    const intro = Array.isArray(cfg.HOME_INTRO) ? cfg.HOME_INTRO : (cfg.HOME_INTRO ? [cfg.HOME_INTRO] : []);
    const services = cfg.HOME_SERVICES || [];

    // The home page lists everything (like the firm's blog): all listings in the
    // main column, broker bios in the sidebar. Load both; a failure just leaves
    // that part empty rather than blocking the page.
    if (!ALL.length) { try { ALL = await BK.listPublicListings(); } catch (e) {} }
    if (!BROKERS.length) { try { BROKERS = await BK.listBrokers(); } catch (e) {} }
    const current = ALL.filter((l) => l.status !== 'sold');   // featured sort first (query order)
    const sold = ALL.filter((l) => l.status === 'sold');

    app.innerHTML = `
      <div class="wrap">
        <section class="home-intro">
          <h1>${esc(cfg.BRAND_NAME || 'Business Brokerage')}</h1>
          ${intro.map((p) => `<p>${esc(p)}</p>`).join('')}
          <div class="home-cta">
            <a class="btn btn-gold" href="/sell" data-link>Sell Your Business</a>
            <a class="btn btn-primary" href="/buy" data-link>Looking for a Business</a>
          </div>
        </section>

        <div class="home-cols">
          <div class="home-main" id="listings">
            <div class="section-head">
              <h2>Current Listings</h2>
              <span class="results-count">${current.length} ${current.length === 1 ? 'business' : 'businesses'}</span>
            </div>
            <div class="listing-full-list">
              ${current.length ? current.map(fullCardHTML).join('') : '<div class="empty">No listings available right now — check back soon.</div>'}
            </div>
            ${sold.length ? `
              <div class="section-head"><h2>Closed Listings</h2><span class="results-count">${sold.length} sold</span></div>
              <div class="listing-full-list">${sold.map(fullCardHTML).join('')}</div>` : ''}
          </div>

          <aside class="home-side">
            <h3 class="side-heading">Our Brokers</h3>
            ${sidebarBrokersHTML()}
            <div class="side-contact">
              <h3 class="side-heading">Get in touch</h3>
              ${contactDetailsHTML()}
            </div>
          </aside>
        </div>

        ${services.length ? `<div class="service-grid">${services.map((s) => `
          <section class="service-card">
            <h2>${esc(s.title)}</h2>
            ${(Array.isArray(s.body) ? s.body : [s.body]).map((p) => `<p>${esc(p)}</p>`).join('')}
          </section>`).join('')}
          <section class="service-card buyers-card">
            <h2>Looking to buy a business?</h2>
            <p>We match qualified buyers with the right opportunity — often before it's publicly listed. Join our buyers list and tell us what you're looking for.</p>
            <a class="btn btn-primary" href="/buy" data-link style="margin-top:6px">Looking for a Business</a>
          </section></div>` : ''}
      </div>`;
  }

  // Compact broker card for the home-page sidebar.
  function sidebarBrokersHTML() {
    if (!BROKERS.length) return '';
    return BROKERS.map((b) => `
      <div class="side-broker">
        <div class="side-broker-head">
          ${avatarHTML(b, 'side-broker-photo')}
          <div>
            <div class="side-broker-name"><a href="/broker/${esc(b.slug)}" data-link>${esc(b.name)}</a></div>
            <div class="side-broker-title">${esc(b.title || '')}</div>
          </div>
        </div>
        <p class="side-broker-bio">${esc(b.bio || '')}</p>
        <div class="side-broker-contact">
          ${b.phone ? `<a href="tel:${tel(b.phone)}">${esc(b.phone)}</a>` : ''}
          ${b.email ? `<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}
          <a href="/broker/${esc(b.slug)}" data-link>View profile →</a>
        </div>
      </div>`).join('');
  }

  // Featured listing card — photo on top, clickable through to the detail page.
  function featureCardHTML(l) {
    const img = primaryImage(l);
    const fin = [
      ['Asking', fmt.money(l.asking_price)],
      ['Cash Flow', fmt.money(l.cash_flow)],
    ].filter((r) => r[1]);
    return `
      <a class="feature-card" href="/listing/${esc(l.slug)}" data-link>
        <div class="feature-thumb">
          ${img ? `<img src="${esc(img)}" alt="${esc(l.title)}" loading="lazy" />` : ''}
          <span class="badge badge-${l.status}">${fmt.statusLabel(l.status)}</span>
          <span class="badge badge-featured feat-right">Featured</span>
        </div>
        <div class="feature-body">
          <span class="cat">${esc(l.category || 'Business')}</span>
          <h3 class="feature-title">${esc(l.title)}</h3>
          <div class="loc">${esc(fmt.location(l))}</div>
          ${fin.length
            ? `<div class="fin">${fin.map((r) => `<div><div class="lbl">${esc(r[0])}</div><div class="val">${esc(r[1])}</div></div>`).join('')}</div>`
            : `<div class="fin"><div><div class="lbl">Status</div><div class="val">${esc(fmt.statusLabel(l.status))}</div></div></div>`}
        </div>
      </a>`;
  }

  // Full listing entry for the home page — shows everything inline, so there's
  // nothing to click through to (blog-style). Not a link.
  function fullCardHTML(l) {
    const img = primaryImage(l);
    const fin = [
      ['Asking Price', fmt.moneyOr(l.asking_price, null)],
      ['Cash Flow', fmt.money(l.cash_flow)],
      ['Gross Revenue', fmt.money(l.gross_revenue)],
      ['Rent', l.rent != null ? fmt.money(l.rent) + '/mo' : null],
    ].filter((r) => r[1]);
    const details = [
      ['Listing ID', refCode(l)],
      ['Category', l.category],
      ['Location', fmt.location(l) + (l.county ? ` (${l.county})` : '')],
      ['Year Established', l.established_year],
      ['Employees', l.employees],
      ['Real Estate', l.real_estate],
      ['Building Size', l.building_sf],
      ['Lease', l.lease_expiration],
      ['Seller Financing', l.seller_financing ? 'Available' : null],
      ['Facilities', l.facilities],
    ].filter((r) => r[1]);
    const b = l.broker;
    return `
      <article class="listing-full" id="listing-${esc(l.slug)}">
        <div class="lf-media">
          ${img ? `<img src="${esc(img)}" alt="${esc(l.title)}" loading="lazy" />` : ''}
          <span class="badge badge-${l.status}">${fmt.statusLabel(l.status)}</span>
          ${l.is_featured ? '<span class="badge badge-featured lf-feat">Featured</span>' : ''}
        </div>
        <div class="lf-body">
          <span class="cat">${esc(l.category || 'Business')}</span>
          <h3 class="lf-title">${esc(l.title)}</h3>
          <div class="loc">${esc(fmt.location(l))}</div>
          ${fin.length ? `<div class="lf-fin">${fin.map((r) =>
            `<div><div class="lbl">${esc(r[0])}</div><div class="val">${esc(r[1])}</div></div>`).join('')}</div>` : ''}
          ${l.description ? `<div class="lf-desc">${esc(l.description)}</div>` : ''}
          ${details.length ? `<table class="lf-details">${details.map((r) =>
            `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}</table>` : ''}
          ${b ? `<div class="lf-broker">Listed by <strong>${esc(b.name)}</strong>${
            b.phone ? ` · <a href="tel:${tel(b.phone)}">${esc(b.phone)}</a>` : ''}${
            b.email ? ` · <a href="mailto:${esc(b.email)}">${esc(b.email)}</a>` : ''}</div>` : ''}
        </div>
      </article>`;
  }

  // Prospective-buyers sign-up form — mirrors the CRM lead fields.
  function buyersFormHTML() {
    const types = cfg.LEAD_BUSINESS_TYPES || [];
    return `
      <form id="form-buyer">
        <div class="form-row">
          <div class="field"><label>Full name *</label><input name="name" required /></div>
          <div class="field"><label>Email *</label><input name="email" type="email" required /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Phone</label><input name="phone" /></div>
          <div class="field"><label>Company / current business</label><input name="company" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Amount to invest (USD)</label><input name="investment_amount" type="number" step="1000" min="0" placeholder="e.g. 300000" /></div>
          <div class="field"><label>Timeframe</label><input name="timeframe" placeholder="e.g. 3–6 months" /></div>
        </div>
        ${types.length ? `
        <div class="field">
          <label>Business types you're interested in</label>
          <div class="type-picker">
            ${types.map((t) => `<label class="type-opt"><input type="checkbox" name="categories" value="${esc(t)}" /> <span>${esc(t)}</span></label>`).join('')}
          </div>
        </div>` : ''}
        <div class="field"><label>What are you looking for?</label><textarea name="message" placeholder="Location preferences, experience, financing, anything else that helps us match you…"></textarea></div>
        <button class="btn btn-gold" type="submit">Add me to the buyers list</button>
        <span class="form-note" style="margin-left:10px">Free and confidential. We only contact you about matching businesses.</span>
      </form>`;
  }

  function wireBuyersForm() {
    const form = document.getElementById('form-buyer');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const d = Object.fromEntries(fd.entries());
      if (!d.name || !d.email) return toast('Name and email are required', 'err');
      const btn = form.querySelector('button[type=submit]');
      const label = btn.textContent; btn.disabled = true; btn.textContent = 'Sending…';
      try {
        await BK.submitInquiry({
          type: 'buyer', name: d.name, email: d.email, phone: d.phone, company: d.company,
          investment_amount: d.investment_amount, timeframe: d.timeframe, message: d.message,
          categories: fd.getAll('categories'),
        });
        form.reset();
        toast('Thanks — you’re on our buyers list. We’ll be in touch.', 'ok');
      } catch (err) {
        toast(err.message || 'Something went wrong.', 'err');
      } finally { btn.disabled = false; btn.textContent = label; }
    });
  }

  // ---------- LISTINGS (/listings) ----------
  function renderHome() {
    // With one active listing and many closed ones, a flat list buries what's
    // actually for sale — so split them the way the firm's own site does.
    const current = ALL.filter((l) => l.status !== 'sold');
    const sold = ALL.filter((l) => l.status === 'sold');

    app.innerHTML = `
      <div class="wrap">
        <div class="section-head">
          <h2>Current Listings</h2>
          <span class="results-count">${current.length} ${current.length === 1 ? 'business' : 'businesses'}</span>
        </div>
        <div class="listing-list">
          ${current.length ? current.map(cardHTML).join('') : '<div class="empty">No listings available right now — check back soon.</div>'}
        </div>

        ${sold.length ? `
          <div class="section-head">
            <h2>Closed Listings</h2>
            <span class="results-count">${sold.length} sold</span>
          </div>
          <div class="listing-list">${sold.map(cardHTML).join('')}</div>` : ''}
      </div>`;
  }

  // ---------- SELL A BUSINESS (/sell) ----------
  function renderSell() {
    app.innerHTML = `
      <div class="wrap">
        <div class="breadcrumb"><a href="/" data-link>Home</a> › Sell a Business</div>
        <div class="block">
          <h2>${esc(cfg.SELL_CTA || 'Contact us to list your business')}</h2>
          <p class="muted">We work confidentially to value, package, and sell established businesses. Tell us about yours and we'll be in touch — no obligation.</p>
          <div style="max-width:560px">${sellFormHTML()}</div>
        </div>
      </div>`;
    wireForm('form-sell', 'seller');
  }

  // ---------- LOOKING FOR A BUSINESS (/buy) ----------
  function renderBuy() {
    app.innerHTML = `
      <div class="wrap">
        <div class="breadcrumb"><a href="/" data-link>Home</a> › Looking for a Business</div>
        <div class="block">
          <h2>Looking for a business?</h2>
          <p class="muted">We match qualified buyers with the right opportunity. Tell us what you're looking for and your budget, and we'll reach out when a fitting business comes to market — often before it's publicly listed. Joining our buyers list is free and confidential.</p>
          <div style="max-width:640px">${buyersFormHTML()}</div>
        </div>
      </div>`;
    wireBuyersForm();
  }

  // ---------- SIGN AN NDA (/nda) ----------
  // Canonical text mirrors api/nda/_agreement.js (keep VERSION in sync).
  const NDA_AGREEMENT = {
    VERSION: 'v1-2026',
    TITLE: "Buyer's Acknowledgement of Introduction and Confidentiality Agreement",
    intro: (biz) => `The undersigned Buyer, individually and on behalf of any affiliated prospective buyer, acknowledges being first introduced to and requests Confidential Information about the following business: <strong>${esc(biz)}</strong>, identified herein by Brokerage NGU Business Real Estate, Edward Lee, an agent of NGU Business Real Estate (Broker). Such Confidential Information shall be provided to Buyer for the sole purpose of evaluating the possible purchase by Buyer of all or part of the stock or assets of the Business. As used in this agreement (Agreement), the term Buyer applies to the undersigned and any partnership, corporation, individual, or other entity with which the undersigned is affiliated. Buyer agrees as follows:`,
    sections: [
      ['1. Non-Disclosure of Information', "Buyer acknowledges that the owner of the Business (Seller) desires to maintain the confidentiality of the information disclosed. Buyer agrees not to disclose or permit access to any Confidential Information without the prior written consent of the Seller, to anyone other than Buyer's legal counsel, accountants, lenders, or other agents or advisors to whom disclosure or access is necessary for Buyer to evaluate the Business. Disclosure shall be made to these parties only in connection with the potential acquisition of the Business, and only if these parties agree to maintain confidentiality. Buyer shall be responsible for any breach of this Agreement by these parties. If the Buyer does not purchase the Business, Buyer, at the close of negotiations, will destroy or return to Broker (at Seller's direction) all information provided and will not retain any copy, reproduction, or record thereof."],
      ['2. Definition of "Confidential Information"', 'The term "Confidential Information" shall mean all information including the fact that the Business is for sale, all financial, production, marketing and pricing information, business methods, manuals, procedures, correspondence, processes, data, contracts, customer lists, employee lists, and any other information whether written, oral, or otherwise made known to Buyer; (a) from any inspection or review of the books, records, assets, liabilities, processes, or production methods of Seller; (b) from any communication with Seller or Seller\'s broker, directors, officers, employees, agents, suppliers, customers or representatives; (c) during visits to Seller\'s premises; or (d) through disclosure or discovery in any other manner.'],
      ["3. Buyer's Responsibility and Disclaimer of Broker's Liability", "NGU Business Real Estate has received information about this Business from the Seller which may include tax returns, financial statements, equipment lists, and facility leases, and often prepares a summary description which may include a cash flow projection or seller discretionary cash flow statement. Buyer understands that the Broker does not audit or verify any information or make any warranty as to its accuracy or completeness, nor guarantee future business performance. Buyer is solely responsible to examine and investigate the Business and all facts which might influence Buyer's purchase decision. Any decision to purchase shall be based solely on Buyer's own investigation and that of Buyer's advisors, not NGU Business Real Estate. Any costs from consultations with advisors are the sole responsibility of the Buyer."],
      ['4. Non-Circumvention Agreement', "The Seller has agreed to pay a fee to the listing broker if, during the term of that agreement or up to twelve months thereafter, the Business is transferred to a buyer introduced by the listing or cooperating broker. Buyer shall conduct all inquiries and discussions solely through Broker and shall not directly contact the Seller or Seller's representatives. Should Buyer purchase any stock or assets of the Business, acquire any interest, execute any lease at the premises, or become affiliated with the Business without Broker's participation, or otherwise interfere with Brokers' right to a fee, Buyer shall be liable for such fee and other damages including reasonable attorney's fees. Buyer acknowledges that the Broker MUST BE NOTIFIED of ALL CONTRACTS, CLOSING DATES, TIMES AND LOCATIONS."],
      ['5. Further Terms', "Neither Buyer nor Buyer's agents will contact Seller's employees, customers, landlords, or suppliers, nor linger or observe the Business, without Seller's consent. For three years, Buyer shall not solicit for employment any employees of Seller. Broker may act as a dual agent representing both Buyer and Seller. Seller and Seller's successors are intended beneficiaries and may enforce this Agreement. This Agreement can only be modified in writing signed by both Broker and Buyer, supersedes all prior understandings, and is governed by the laws of the State of New York. Venue for any action shall be the county in which the Business is located. This Agreement may be signed in counterparts; electronic signatures may be considered originals. Buyer acknowledges receipt of a fully completed copy of this Agreement."],
    ],
  };

  const ndaState = { session_id: null, verified: false, listing: null, sigMode: 'draw', drew: false };

  async function renderNDA() {
    app.innerHTML = `<div class="wrap"><div class="empty">Loading…</div></div>`;
    if (!ALL.length) { try { ALL = await BK.listPublicListings(); } catch (e) {} }
    const live = ALL.filter((l) => l.status !== 'sold' && l.status !== 'withdrawn' && l.status !== 'draft');
    const diditOn = !!(cfg.DIDIT_ENABLED === undefined ? true : cfg.DIDIT_ENABLED);

    app.innerHTML = `
      <div class="wrap">
        <div class="breadcrumb"><a href="/" data-link>Home</a> › Confidentiality Agreement</div>
        <div class="block nda-block">
          <h2>Request Confidential Information</h2>
          <p class="muted">To receive confidential details about one of our businesses, please verify your identity and sign our confidentiality agreement. It takes just a few minutes.</p>

          <ol class="nda-steps">
            <li class="nda-step" data-step="1">
              <h3><span class="nda-num">1</span> Your details &amp; the business</h3>
              <div class="nda-step-body">
                <div class="field"><label>Business you're interested in *</label>
                  <select id="nda-listing" required>
                    <option value="">Select a business…</option>
                    ${live.map((l) => `<option value="${esc(l.id)}">${refCode(l) ? esc(refCode(l)) + ' — ' : ''}${esc(l.title)}</option>`).join('')}
                  </select>
                </div>
                <div class="form-row">
                  <div class="field"><label>Full name *</label><input id="nda-name" required/></div>
                  <div class="field"><label>Email *</label><input id="nda-email" type="email" required/></div>
                </div>
                <div class="field" style="max-width:300px"><label>Phone</label><input id="nda-phone"/></div>
                <button class="btn btn-primary" id="nda-to-verify">Continue</button>
              </div>
            </li>

            <li class="nda-step is-locked" data-step="2">
              <h3><span class="nda-num">2</span> Verify your identity</h3>
              <div class="nda-step-body">
                <p class="muted">We use Didit to confirm your identity. Your documents go directly to Didit — NGU never sees them.</p>
                <div id="nda-verify-area"></div>
              </div>
            </li>

            <li class="nda-step is-locked" data-step="3">
              <h3><span class="nda-num">3</span> Review &amp; sign</h3>
              <div class="nda-step-body">
                <div class="nda-doc" id="nda-doc"></div>
                <div class="nda-sign">
                  <div class="sign-head">
                    <label>Signature *</label>
                    <div class="sign-toggle">
                      <button type="button" class="active" data-sig="draw">Draw</button>
                      <button type="button" data-sig="type">Type</button>
                    </div>
                  </div>
                  <div id="sig-draw-wrap"><canvas id="sig-pad" width="520" height="150"></canvas>
                    <button type="button" class="btn btn-ghost btn-sm" id="sig-clear">Clear</button></div>
                  <div id="sig-type-wrap" hidden><input id="sig-typed" class="sig-typed" placeholder="Type your full legal name"/></div>
                </div>
                <label class="nda-agree"><input type="checkbox" id="nda-agree"/> I have read and agree to the confidentiality agreement above, and I am signing it electronically.</label>
                <button class="btn btn-primary" id="nda-submit" disabled>Sign &amp; Submit</button>
                <p class="form-note">By signing you agree your electronic signature is legally binding.</p>
              </div>
            </li>
          </ol>
          <div id="nda-done" hidden></div>
        </div>
      </div>`;

    wireNDA(diditOn);
  }

  function ndaUnlock(step) {
    const el = app.querySelector(`.nda-step[data-step="${step}"]`);
    if (el) { el.classList.remove('is-locked'); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  function wireNDA(diditOn) {
    const sel = app.querySelector('#nda-listing');
    const nameEl = app.querySelector('#nda-name');
    const emailEl = app.querySelector('#nda-email');
    const phoneEl = app.querySelector('#nda-phone');

    app.querySelector('#nda-to-verify').addEventListener('click', async () => {
      if (!sel.value) return alert('Please select a business.');
      if (!nameEl.value.trim() || !emailEl.value.trim()) return alert('Name and email are required.');
      ndaState.listing = ALL.find((l) => l.id === sel.value);
      // Render the agreement now that we know the business.
      renderNDADoc(ndaState.listing);
      ndaUnlock(2);
      startVerification(diditOn);
    });

    // Signature mode toggle
    app.querySelectorAll('.sign-toggle button').forEach((b) => b.addEventListener('click', () => {
      app.querySelectorAll('.sign-toggle button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      ndaState.sigMode = b.dataset.sig;
      app.querySelector('#sig-draw-wrap').hidden = b.dataset.sig !== 'draw';
      app.querySelector('#sig-type-wrap').hidden = b.dataset.sig !== 'type';
      refreshSubmit();
    }));
    setupSignaturePad();
    app.querySelector('#sig-typed').addEventListener('input', refreshSubmit);
    app.querySelector('#nda-agree').addEventListener('change', refreshSubmit);
    app.querySelector('#nda-submit').addEventListener('click', submitNDA);
  }

  function renderNDADoc(listing) {
    const biz = (refCode(listing) ? refCode(listing) + ' — ' : '') + listing.title;
    app.querySelector('#nda-doc').innerHTML = `
      <h4 class="nda-doc-title">${esc(NDA_AGREEMENT.TITLE)}</h4>
      <p>${NDA_AGREEMENT.intro(biz)}</p>
      ${NDA_AGREEMENT.sections.map((s) => `<p><strong>${esc(s[0])}:</strong> ${esc(s[1])}</p>`).join('')}
      <p class="muted" style="font-size:13px">Broker: Edward Lee, NGU Business Real Estate · Governed by the laws of the State of New York.</p>`;
  }

  async function startVerification(diditOn) {
    const area = app.querySelector('#nda-verify-area');
    if (!diditOn) { ndaState.verified = true; area.innerHTML = '<p class="nda-ok">✓ Identity step skipped.</p>'; ndaUnlock(3); return; }
    area.innerHTML = '<p class="muted">Starting secure verification…</p>';
    try {
      const r = await fetch('/api/didit/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'nda-' + (ndaState.listing ? ndaState.listing.id : '') + '-' + Date.now() }),
      });
      const d = await r.json();
      if (!r.ok || !d.url) { area.innerHTML = `<p class="nda-err">Couldn't start verification right now. Please try again later or contact us.</p>`; return; }
      ndaState.session_id = d.session_id;
      area.innerHTML = `
        <iframe class="nda-didit" src="${esc(d.url)}" allow="camera; microphone; fullscreen; autoplay; encrypted-media"></iframe>
        <p class="form-note">Camera not working? <a href="${esc(d.url)}" target="_blank" rel="noopener">Open verification in a new tab</a>.</p>
        <div class="nda-verify-actions">
          <button class="btn btn-primary" id="nda-check">I've finished — check status</button>
          <span id="nda-vstatus" class="muted"></span>
        </div>`;
      app.querySelector('#nda-check').addEventListener('click', () => pollVerification(true));
      // Gentle auto-poll in the background.
      ndaPollTimer = setInterval(() => pollVerification(false), 6000);
    } catch (e) { area.innerHTML = `<p class="nda-err">Verification service unreachable. Please try again later.</p>`; }
  }

  let ndaPollTimer = null;
  async function pollVerification(manual) {
    if (!ndaState.session_id || ndaState.verified) return;
    const st = app.querySelector('#nda-vstatus');
    if (manual && st) st.textContent = 'Checking…';
    try {
      const r = await fetch('/api/didit/status?session_id=' + encodeURIComponent(ndaState.session_id));
      const d = await r.json();
      if (d.status === 'Approved') {
        ndaState.verified = true;
        if (ndaPollTimer) clearInterval(ndaPollTimer);
        app.querySelector('#nda-verify-area').innerHTML = '<p class="nda-ok">✓ Identity verified. You can now review and sign below.</p>';
        ndaUnlock(3);
      } else if (manual && st) {
        st.textContent = (d.status === 'Declined') ? 'Verification was declined. Please retry or contact us.'
          : 'Not verified yet (status: ' + (d.status || 'pending') + '). Finish in the window, then check again.';
      }
    } catch (e) { if (manual && st) st.textContent = 'Could not check status. Try again.'; }
  }

  function setupSignaturePad() {
    const c = app.querySelector('#sig-pad'); if (!c) return;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#10243e';
    let drawing = false, last = null;
    const pos = (e) => { const r = c.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }; };
    const start = (e) => { drawing = true; last = pos(e); e.preventDefault(); };
    const move = (e) => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; ndaState.drew = true; refreshSubmit(); e.preventDefault(); };
    const end = () => { drawing = false; };
    c.addEventListener('mousedown', start); c.addEventListener('mousemove', move); window.addEventListener('mouseup', end);
    c.addEventListener('touchstart', start, { passive: false }); c.addEventListener('touchmove', move, { passive: false }); c.addEventListener('touchend', end);
    app.querySelector('#sig-clear').addEventListener('click', () => { ctx.clearRect(0, 0, c.width, c.height); ndaState.drew = false; refreshSubmit(); });
  }

  function signatureValue() {
    if (ndaState.sigMode === 'draw') return ndaState.drew ? app.querySelector('#sig-pad').toDataURL('image/png') : '';
    return (app.querySelector('#sig-typed').value || '').trim();
  }

  function refreshSubmit() {
    const btn = app.querySelector('#nda-submit'); if (!btn) return;
    const ok = ndaState.verified && app.querySelector('#nda-agree').checked && !!signatureValue();
    btn.disabled = !ok;
  }

  async function submitNDA() {
    const btn = app.querySelector('#nda-submit');
    const sig = signatureValue();
    if (!ndaState.verified || !sig || !app.querySelector('#nda-agree').checked) return;
    btn.disabled = true; btn.textContent = 'Submitting…';
    try {
      const r = await fetch('/api/nda/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listing_id: ndaState.listing.id,
          name: app.querySelector('#nda-name').value.trim(),
          email: app.querySelector('#nda-email').value.trim(),
          phone: app.querySelector('#nda-phone').value.trim(),
          signature: sig,
          signature_type: ndaState.sigMode === 'draw' ? 'drawn' : 'typed',
          session_id: ndaState.session_id,
        }),
      });
      const d = await r.json();
      if (!r.ok) { btn.disabled = false; btn.textContent = 'Sign & Submit'; return alert(d.error || 'Could not submit. Please try again.'); }
      const done = app.querySelector('#nda-done');
      app.querySelector('.nda-steps').hidden = true;
      done.hidden = false;
      done.innerHTML = `<div class="nda-success">
        <h3>✓ Thank you — your NDA is signed.</h3>
        <p>You've signed the confidentiality agreement for <strong>${esc(d.business || ndaState.listing.title)}</strong>.${d.emailed ? ' A copy has been emailed to you.' : ''}</p>
        <p class="muted">A member of our team will follow up shortly with the confidential information. Questions? <a href="/sell" data-link>Contact us</a>.</p>
      </div>`;
      done.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { btn.disabled = false; btn.textContent = 'Sign & Submit'; alert('Something went wrong. Please try again.'); }
  }

  // Single-column row: image left, details right. Only shows the financial
  // figures a listing actually discloses.
  function cardHTML(l) {
    const img = primaryImage(l);
    const fin = [
      ['Asking Price', fmt.money(l.asking_price)],
      ['Cash Flow', fmt.money(l.cash_flow)],
      ['Gross Revenue', fmt.money(l.gross_revenue)],
    ].filter((r) => r[1]);

    return `
      <a class="listing-row" href="/listing/${esc(l.slug)}" data-link>
        <div class="row-thumb">
          ${img ? `<img src="${esc(img)}" alt="${esc(l.title)}" loading="lazy" />` : ''}
          <span class="badge badge-${l.status}">${fmt.statusLabel(l.status)}</span>
        </div>
        <div class="row-body">
          <div class="row-top">
            <span class="cat">${esc(l.category || 'Business')}</span>
            ${l.is_featured ? '<span class="badge badge-featured">Featured</span>' : ''}
          </div>
          <h3 class="title">${esc(l.title)}</h3>
          <div class="loc">${esc(fmt.location(l))}</div>
          ${fin.length ? `<div class="fin">${fin.map((r) =>
            `<div><div class="lbl">${esc(r[0])}</div><div class="val">${esc(r[1])}</div></div>`).join('')}</div>` : ''}
        </div>
      </a>`;
  }

  // ---------- DETAIL ----------
  async function renderDetail(slug) {
    app.innerHTML = '<div class="wrap"><div class="empty">Loading listing…</div></div>';
    let l;
    try { l = await BK.getListingBySlug(slug); }
    catch (e) { app.innerHTML = dataErrorHTML(e); return; }
    if (!l) {
      app.innerHTML = `<div class="wrap"><div class="empty">Listing not found. <a href="/listings" data-link>Back to all listings</a></div></div>`;
      return;
    }

    const imgs = (l.listing_images || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const main = primaryImage(l) || (imgs[0] && imgs[0].url);

    const fin = [
      ['Asking Price', fmt.moneyOr(l.asking_price)],
      ['Cash Flow', fmt.money(l.cash_flow)],
      ['Gross Revenue', fmt.money(l.gross_revenue)],
      ['EBITDA', fmt.money(l.ebitda)],
      ['FF&E', l.ffe != null ? fmt.money(l.ffe) + (l.is_ffe_included ? ' (incl.)' : '') : null],
      ['Inventory', l.inventory != null ? fmt.money(l.inventory) + (l.is_inventory_included ? ' (incl.)' : '') : null],
      ['Real Estate', l.real_estate_value != null ? fmt.money(l.real_estate_value) : null],
      ['Rent', l.rent != null ? fmt.money(l.rent) + '/mo' : null],
    ].filter((r) => r[1]);

    const details = [
      ['Location', fmt.location(l) + (l.county ? ` (${l.county})` : '')],
      ['Category', l.category],
      ['Year Established', l.established_year],
      ['Employees', l.employees],
      ['Real Estate', l.real_estate],
      ['Building Size', l.building_sf],
      ['Lease Expiration', l.lease_expiration],
      ['Franchise', l.is_franchise ? 'Yes' : null],
      ['Seller Financing', l.seller_financing ? 'Available' : null],
      ['Support & Training', l.support_training],
      ['Reason for Selling', l.reason_for_selling],
      ['Facilities', l.facilities],
      ['Competition', l.competition],
      ['Growth & Expansion', l.growth_expansion],
    ].filter((r) => r[1]);

    app.innerHTML = `
      <div class="wrap">
        <div class="breadcrumb"><a href="/listings" data-link>Listings</a> › ${esc(l.category || 'Business')} › ${esc(l.title)}</div>
        <div class="detail">
          <div class="detail-main">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <span class="badge badge-${l.status}">${fmt.statusLabel(l.status)}</span>
              ${l.is_featured ? '<span class="badge badge-featured">Featured</span>' : ''}
            </div>
            <h1>${esc(l.title)}</h1>

            <div class="gallery">
              <div class="main"><img id="gimg" src="${esc(main || '')}" alt="${esc(l.title)}" /></div>
              ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((im, i) =>
                `<img src="${esc(im.url)}" data-src="${esc(im.url)}" class="${im.url === main ? 'active' : ''}" alt="${esc(im.caption || '')}" />`).join('')}</div>` : ''}
            </div>

            <div class="block">
              <h2>Business Description</h2>
              <div class="desc">${esc(l.description || 'No description provided.')}</div>
            </div>

            <div class="block">
              <h2>Detailed Information</h2>
              <table class="detail-table">
                ${details.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join('')}
              </table>
            </div>

            <div class="block" id="inquire">
              <h2>Contact ${l.broker ? esc(l.broker.name) : 'the broker'} about this business</h2>
              <p class="muted">Send an inquiry and we'll follow up, typically within one business day.</p>
              <div style="max-width:560px">${contactFormHTML('inquiry', l.id, l.broker ? l.broker.id : null)}</div>
            </div>
          </div>

          <aside class="finbox">
            <div class="price-card">
              <div class="price-head">
                <div class="lbl">Asking Price</div>
                <div class="amt">${esc(fmt.moneyOr(l.asking_price))}</div>
              </div>
              ${fin.slice(1).map((r) => `<div class="finrow"><span class="k">${esc(r[0])}</span><span class="v">${esc(r[1])}</span></div>`).join('')}
              ${l.seller_financing ? '<div class="seller-fin">✓ Seller financing available</div>' : ''}
              <div class="cta">
                <a href="#inquire" class="btn btn-primary btn-block">Contact Broker</a>
              </div>
            </div>
            ${(l.agents && l.agents.length) ? `
              <div class="listed-by">
                <div class="listed-by-label">Listed by</div>
                ${l.agents.map((b, i) => `
                  <div class="listed-by-agent${i ? ' extra' : ''}">
                    <a class="listed-by-row" href="/broker/${esc(b.slug)}" data-link>
                      ${avatarHTML(b, 'listed-by-avatar')}
                      <div>
                        <div class="listed-by-name">${esc(b.name)}</div>
                        <div class="listed-by-title">${esc(b.title || '')}</div>
                      </div>
                    </a>
                    <div class="listed-by-contact">
                      ${b.phone ? `<a href="tel:${tel(b.phone)}">📞 ${esc(b.phone)}</a>` : ''}
                      ${b.email ? `<a href="mailto:${esc(b.email)}">✉️ ${esc(b.email)}</a>` : ''}
                    </div>
                  </div>`).join('')}
              </div>` : ''}
            <p class="form-note" style="margin-top:12px">Listing ID: ${esc(l.slug)}<br/>${esc(cfg.DISCLAIMER || '')}</p>
          </aside>
        </div>
      </div>`;

    // gallery thumbnails
    app.querySelectorAll('.thumbs img').forEach((t) => t.addEventListener('click', () => {
      document.getElementById('gimg').src = t.dataset.src;
      app.querySelectorAll('.thumbs img').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
    }));

    wireForm('form-inquiry', 'inquiry');
  }

  // ---------- forms ----------
  function contactFormHTML(type, listingId, brokerId) {
    return `
      <form id="form-inquiry" data-listing="${listingId || ''}" data-type="${type}" data-broker="${brokerId || ''}">
        <div class="form-row">
          <div class="field"><label>Name *</label><input name="name" required /></div>
          <div class="field"><label>Email *</label><input name="email" type="email" required /></div>
        </div>
        <div class="field"><label>Phone</label><input name="phone" /></div>
        <div class="field"><label>Message *</label><textarea name="message" required placeholder="I'd like more information about this business…"></textarea></div>
        <button class="btn btn-primary" type="submit">Send Inquiry</button>
        <span class="form-note" style="margin-left:10px">Your information is kept confidential.</span>
      </form>`;
  }

  const tel = (p) => esc(String(p || '').replace(/[^0-9+]/g, ''));
  const initials = (name) => esc((name || '?').split(' ').map((w) => w[0]).slice(0, 2).join(''));

  // Broker avatar: real photo if set, else initials tile. A photo that fails to
  // load (missing file, dead URL) degrades to the initials tile — see the
  // capture-phase 'error' listener below.
  function avatarHTML(b, cls) {
    return b.photo_url
      ? `<img class="${cls} photo" src="${esc(b.photo_url)}" alt="${esc(b.name)}" data-initials="${initials(b.name)}" />`
      : `<div class="${cls}">${initials(b.name)}</div>`;
  }

  // 'error' doesn't bubble, so listen in the capture phase to catch every avatar
  // regardless of which view rendered it.
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (img && img.tagName === 'IMG' && img.dataset && img.dataset.initials) {
      const tile = document.createElement('div');
      tile.className = img.className.replace(/\bphoto\b/, '').trim();
      tile.textContent = img.dataset.initials;
      img.replaceWith(tile);
    }
  }, true);

  // Firm blurb shown above the broker profiles. ABOUT may be an array of
  // paragraphs or a single string (older config), so accept both.
  function aboutPanelHTML() {
    const paras = Array.isArray(cfg.ABOUT) ? cfg.ABOUT : (cfg.ABOUT ? [cfg.ABOUT] : []);
    if (!paras.length && !cfg.ABOUT_HEADING) return '';
    return `<section class="about-panel">
      ${cfg.ABOUT_HEADING ? `<h3 class="about-panel-heading">${esc(cfg.ABOUT_HEADING)}</h3>` : ''}
      ${paras.map((p) => `<p class="about-text">${esc(p)}</p>`).join('')}
    </section>`;
  }

  function teamHTML() {
    if (!BROKERS.length) return '';
    return `<h3 class="team-heading">The Team</h3>
      <div class="team-grid">${BROKERS.map((m) => `
      <div class="team-card">
        ${avatarHTML(m, 'team-avatar')}
        <div class="team-name"><a href="/broker/${esc(m.slug)}" data-link>${esc(m.name)}</a></div>
        <div class="team-title">${esc(m.title || '')}</div>
        <p class="team-bio">${esc(m.bio || '')}</p>
        <div class="team-contact">
          ${m.phone ? `<a href="tel:${tel(m.phone)}">${esc(m.phone)}</a>` : ''}
          ${m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ''}
          <a href="/broker/${esc(m.slug)}" data-link>View profile &amp; listings →</a>
        </div>
      </div>`).join('')}</div>`;
  }

  function contactDetailsHTML() {
    const rows = [];
    if (cfg.CONTACT_ADDRESS) rows.push(`<div>📍 ${esc(cfg.CONTACT_ADDRESS)}</div>`);
    BROKERS.forEach((m) => {
      rows.push(`<div>👤 <strong>${esc(m.name)}</strong>${m.phone ? ` · <a href="tel:${tel(m.phone)}">${esc(m.phone)}</a>` : ''}${m.email ? ` · <a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : ''}</div>`);
    });
    if (!rows.length && cfg.CONTACT_EMAIL) rows.push(`<div>✉️ <a href="mailto:${esc(cfg.CONTACT_EMAIL)}">${esc(cfg.CONTACT_EMAIL)}</a></div>`);
    return `<div class="contact-details">${rows.join('')}</div>`;
  }

  // ---------- BROKER PROFILE (/broker/:slug) ----------
  async function renderBroker(slug) {
    app.innerHTML = '<div class="wrap"><div class="empty">Loading…</div></div>';
    let b;
    try { b = await BK.getBrokerBySlug(slug); }
    catch (e) { app.innerHTML = dataErrorHTML(e); return; }
    if (!b) {
      app.innerHTML = `<div class="wrap"><div class="empty">Broker not found. <a href="/brokers" data-link>Back to About Us</a></div></div>`;
      return;
    }
    let mine = [];
    try { mine = await BK.listListingsByBroker(b.id); } catch (e) {}
    const active = mine.filter((l) => l.status !== 'sold');
    const sold = mine.filter((l) => l.status === 'sold');

    app.innerHTML = `
      <div class="wrap">
        <div class="breadcrumb"><a href="/" data-link>Home</a> › <a href="/brokers" data-link>About Us</a> › ${esc(b.name)}</div>
        <div class="broker-hero block">
          ${avatarHTML(b, 'broker-photo')}
          <div class="broker-info">
            <h1>${esc(b.name)}</h1>
            <div class="broker-title">${esc(b.title || '')}</div>
            ${b.license_no ? `<div class="muted" style="font-size:13px">License #${esc(b.license_no)}</div>` : ''}
            <p class="broker-bio">${esc(b.bio || '')}</p>
            <div class="broker-actions">
              ${b.phone ? `<a class="btn btn-primary" href="tel:${tel(b.phone)}">📞 ${esc(b.phone)}</a>` : ''}
              ${b.email ? `<a class="btn btn-ghost" href="mailto:${esc(b.email)}">✉️ ${esc(b.email)}</a>` : ''}
            </div>
          </div>
        </div>

        <div class="section-head"><h2>Current Listings</h2><span class="results-count">${active.length}</span></div>
        <div class="listing-list">${active.length ? active.map(cardHTML).join('') : `<div class="empty">No active listings right now.</div>`}</div>

        ${sold.length ? `
          <div class="section-head"><h2>Closed Listings</h2><span class="results-count">${sold.length} sold</span></div>
          <div class="listing-list">${sold.map(cardHTML).join('')}</div>` : ''}

        <div class="block">
          <h2>Contact ${esc(b.name.split(' ')[0])}</h2>
          <p class="muted">Send a message directly — it goes straight to ${esc(b.name.split(' ')[0])}.</p>
          <div style="max-width:560px">${contactFormHTML('inquiry', null, b.id)}</div>
        </div>
      </div>`;
    wireForm('form-inquiry', 'inquiry');
  }

  // ---------- BROKERS INDEX (/brokers) ----------
  async function renderBrokers() {
    if (!BROKERS.length) { try { BROKERS = await BK.listBrokers(); } catch (e) {} }
    app.innerHTML = `
      <div class="wrap">
        <div class="breadcrumb"><a href="/" data-link>Home</a> › About Us</div>
        <div class="block">
          <h2>About Us</h2>
          ${aboutPanelHTML()}
          ${teamHTML()}
          <h3 style="margin:28px 0 10px">Get in touch</h3>
          ${contactDetailsHTML()}
        </div>
      </div>`;
  }

  function sellFormHTML() {
    return `
      <form id="form-sell" data-type="seller">
        <div class="form-row">
          <div class="field"><label>Name *</label><input name="name" required /></div>
          <div class="field"><label>Email *</label><input name="email" type="email" required /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Phone</label><input name="phone" /></div>
          <div class="field"><label>Business / Industry</label><input name="company" /></div>
        </div>
        <div class="field"><label>Tell us about your business *</label><textarea name="message" required placeholder="Industry, location, approximate revenue, and your timeframe…"></textarea></div>
        <button class="btn btn-gold" type="submit">Request a Confidential Consultation</button>
      </form>`;
  }

  function wireForm(id, type) {
    const form = document.getElementById(id);
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.name || !data.email) return toast('Name and email are required', 'err');
      btn.disabled = true;
      const label = btn.textContent; btn.textContent = 'Sending…';
      try {
        await BK.submitInquiry({
          name: data.name, email: data.email, phone: data.phone, message: data.message,
          company: data.company, listing_id: form.dataset.listing || null,
          broker_id: form.dataset.broker || null, type: form.dataset.type || type,
        });
        form.reset();
        toast('Thank you — your message has been sent.', 'ok');
      } catch (err) {
        toast(err.message || 'Something went wrong.', 'err');
      } finally { btn.disabled = false; btn.textContent = label; }
    });
  }

  // ---------- router ----------
  async function render() {
    const path = location.pathname;
    BK.recordView(path);   // fire-and-forget page-view tracking

    const mb = path.match(/^\/broker\/([^\/?#]+)/);
    if (mb) return renderBroker(decodeURIComponent(mb[1]));
    if (/^\/brokers\/?$/.test(path)) return renderBrokers();
    if (/^\/sell\/?$/.test(path)) return renderSell();
    if (/^\/buy\/?$/.test(path)) return renderBuy();
    if (/^\/nda\/?$/.test(path)) return renderNDA();

    const m = path.match(/^\/listing\/([^\/?#]+)/);
    if (m) return renderDetail(decodeURIComponent(m[1]));

    // Home is static copy — render it without waiting on a listings fetch.
    if (/^\/?$/.test(path)) return renderHomePage();

    // Everything else falls through to the listings index.
    if (!ALL.length) {
      try { ALL = await BK.listPublicListings(); }
      catch (e) { app.innerHTML = dataErrorHTML(e); return; }
    }
    renderHome();
  }

  // intercept internal links
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (a && a.getAttribute('href').indexOf('/') === 0) {
      e.preventDefault();
      navigate(a.getAttribute('href'));
      window.scrollTo(0, 0);
    }
  });
  window.addEventListener('popstate', render);

  applyBranding();
  render();
})();
