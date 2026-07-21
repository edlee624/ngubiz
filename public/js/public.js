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
    const noSchema = /Could not find the table|PGRST205|schema cache/i.test(msg);
    if (noSchema) {
      return `<div class="wrap"><div class="empty">
        <h2>Database not set up yet</h2>
        <p>Connected to Supabase, but the tables don't exist.</p>
        <p class="muted">Run <code>supabase/all_in_one.sql</code> in the Supabase SQL Editor, then reload.</p>
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
    if (cfg.BRAND_TAGLINE) document.getElementById('brand-tag').textContent = cfg.BRAND_TAGLINE;

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

  // ---------- HOME ----------
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

        <div class="block" id="about">
          <h2>About Us</h2>
          <p class="about-text">${esc(cfg.ABOUT || cfg.BRAND_TAGLINE || '')}</p>
          <h3 style="margin:26px 0 0">Our Brokers</h3>
          ${teamHTML()}
        </div>

        <div class="block" id="sell">
          <h2>${esc(cfg.SELL_CTA || 'Contact us to list your business')}</h2>
          <p class="muted">We work confidentially to value, package, and sell established businesses. Tell us about yours and we'll be in touch — no obligation.</p>
          <div style="max-width:560px">${sellFormHTML()}</div>
        </div>

        <div class="block" id="contact">
          <h2>Contact us</h2>
          <p class="muted">Questions about a listing or the buying process? Send a note and we'll follow up.</p>
          ${contactDetailsHTML()}
          <div style="max-width:560px;margin-top:16px">${contactFormHTML('inquiry', null)}</div>
        </div>
      </div>`;

    wireForm('form-sell', 'seller');
    wireForm('form-inquiry', 'inquiry');
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
          ${l.headline ? `<p class="row-headline">${esc(l.headline)}</p>` : ''}
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
    catch (e) { app.innerHTML = `<div class="wrap"><div class="empty">Couldn't load this listing.</div></div>`; return; }
    if (!l) {
      app.innerHTML = `<div class="wrap"><div class="empty">Listing not found. <a href="/" data-link>Back to all listings</a></div></div>`;
      return;
    }

    const imgs = (l.listing_images || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const main = primaryImage(l) || (imgs[0] && imgs[0].url);
    const hasDocs = (l.documents || []).length > 0 || !BK.isDemo; // live: may have docs we can't see until NDA

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
        <div class="breadcrumb"><a href="/" data-link>Listings</a> › ${esc(l.category || 'Business')} › ${esc(l.title)}</div>
        <div class="detail">
          <div class="detail-main">
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
              <span class="badge badge-${l.status}">${fmt.statusLabel(l.status)}</span>
              ${l.is_featured ? '<span class="badge badge-featured">Featured</span>' : ''}
            </div>
            <h1>${esc(l.title)}</h1>
            <div class="sub">${esc(l.headline || '')}</div>

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
                ${hasDocs ? '<button class="btn btn-gold btn-block" id="nda-btn">🔒 Unlock Confidential Documents</button>' : ''}
              </div>
            </div>
            ${l.broker ? `
              <div class="listed-by">
                <div class="listed-by-label">Listed by</div>
                <a class="listed-by-row" href="/broker/${esc(l.broker.slug)}" data-link>
                  ${avatarHTML(l.broker, 'listed-by-avatar')}
                  <div>
                    <div class="listed-by-name">${esc(l.broker.name)}</div>
                    <div class="listed-by-title">${esc(l.broker.title || '')}</div>
                  </div>
                </a>
                <div class="listed-by-contact">
                  ${l.broker.phone ? `<a href="tel:${tel(l.broker.phone)}">📞 ${esc(l.broker.phone)}</a>` : ''}
                  ${l.broker.email ? `<a href="mailto:${esc(l.broker.email)}">✉️ ${esc(l.broker.email)}</a>` : ''}
                </div>
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
    const ndaBtn = document.getElementById('nda-btn');
    if (ndaBtn) ndaBtn.addEventListener('click', () => openNda(l));
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

  function teamHTML() {
    if (!BROKERS.length) return '';
    return `<div class="team-grid">${BROKERS.map((m) => `
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
    catch (e) { app.innerHTML = `<div class="wrap"><div class="empty">Couldn't load this profile.</div></div>`; return; }
    if (!b) {
      app.innerHTML = `<div class="wrap"><div class="empty">Broker not found. <a href="/" data-link>Back to listings</a></div></div>`;
      return;
    }
    let mine = [];
    try { mine = await BK.listListingsByBroker(b.id); } catch (e) {}
    const active = mine.filter((l) => l.status !== 'sold');
    const sold = mine.filter((l) => l.status === 'sold');

    app.innerHTML = `
      <div class="wrap">
        <div class="breadcrumb"><a href="/" data-link>Home</a> › <a href="/brokers" data-link>Our Brokers</a> › ${esc(b.name)}</div>
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
        <div class="breadcrumb"><a href="/" data-link>Home</a> › Our Brokers</div>
        <div class="block">
          <h2>Our Brokers</h2>
          <p class="muted">${esc(cfg.BRAND_TAGLINE || '')}</p>
          ${teamHTML()}
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

  // ---------- NDA modal ----------
  function openNda(l) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>Confidentiality Agreement</h3><button class="modal-x" aria-label="Close">×</button></div>
        <div class="modal-body">
          <p class="muted" style="margin-top:0">To access confidential documents for <strong>${esc(l.title)}</strong>, please review and accept the terms below.</p>
          <div class="nda-terms">
            The undersigned acknowledges that any information provided regarding this business is confidential.
            I agree not to disclose, copy, or use any such information except to evaluate a potential acquisition,
            not to contact the owner, employees, customers, or suppliers directly, and to return or destroy all
            materials upon request. This acknowledgement is legally binding.
          </div>
          <form id="form-nda">
            <div class="form-row">
              <div class="field"><label>Full legal name *</label><input name="name" required /></div>
              <div class="field"><label>Email *</label><input name="email" type="email" required /></div>
            </div>
            <div class="field"><label>Phone</label><input name="phone" /></div>
            <label style="display:flex;gap:8px;font-size:13px;color:var(--muted);align-items:flex-start;margin-bottom:14px">
              <input type="checkbox" name="agree" required style="width:auto;margin-top:3px" />
              <span>I have read and agree to the terms of this confidentiality agreement, and my typed name serves as my electronic signature.</span>
            </label>
            <button class="btn btn-gold btn-block" type="submit">Sign &amp; Unlock Documents</button>
          </form>
          <div id="nda-docs" class="hidden"></div>
        </div>
      </div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.querySelector('.modal-x').addEventListener('click', close);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });

    back.querySelector('#form-nda').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const d = Object.fromEntries(new FormData(form).entries());
      if (!d.agree) return toast('Please accept the agreement to continue.', 'err');
      const btn = form.querySelector('button');
      btn.disabled = true; btn.textContent = 'Signing…';
      try {
        const docs = await BK.signNda({ listing_id: l.id, name: d.name, email: d.email, phone: d.phone });
        form.classList.add('hidden');
        const wrap = back.querySelector('#nda-docs');
        wrap.classList.remove('hidden');
        wrap.innerHTML = `
          <p style="color:var(--green);font-weight:600">✓ NDA signed. ${docs && docs.length ? 'Your documents are below.' : 'Thank you — the broker will send documents shortly.'}</p>
          ${(docs || []).map((doc) => `<div class="finrow"><span class="k">📄 ${esc(doc.name)}</span>
            <a class="v" href="${esc(doc.file_url)}" ${doc.file_url && doc.file_url.indexOf('#') !== 0 ? 'target="_blank" rel="noopener"' : ''}>Download</a></div>`).join('')}
          ${BK.isDemo ? '<p class="form-note" style="margin-top:12px">(Demo mode — document links are placeholders.)</p>' : ''}`;
      } catch (err) {
        toast(err.message || 'Could not record signature.', 'err');
        btn.disabled = false; btn.textContent = 'Sign & Unlock Documents';
      }
    });
  }

  // ---------- router ----------
  async function render() {
    const path = location.pathname;

    const mb = path.match(/^\/broker\/([^\/?#]+)/);
    if (mb) return renderBroker(decodeURIComponent(mb[1]));
    if (/^\/brokers\/?$/.test(path)) return renderBrokers();

    const m = path.match(/^\/listing\/([^\/?#]+)/);
    if (m) return renderDetail(decodeURIComponent(m[1]));

    // home — ensure data loaded
    if (!ALL.length) {
      try { ALL = await BK.listPublicListings(); }
      catch (e) { app.innerHTML = dataErrorHTML(e); return; }
    }
    if (!BROKERS.length) { try { BROKERS = await BK.listBrokers(); } catch (e) {} }
    renderHome();
    // scroll to hash section if present
    if (location.hash) { const el = document.querySelector(location.hash); if (el) el.scrollIntoView(); }
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
