// Broker admin: listings CRUD (+ images + NDA-gated documents) and a leads pipeline.
(function () {
  const BK = window.BK, fmt = BK.fmt, cfg = BK.config;
  const loginView = document.getElementById('login-view');
  const appView = document.getElementById('app-view');
  const main = document.getElementById('admin-main');
  let tab = 'listings';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const val = (v) => (v == null ? '' : String(v));

  function toast(msg, kind) {
    const t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.remove(), 3400);
  }

  const STAGES = [
    ['new', 'New'], ['contacted', 'Contacted'], ['nda_signed', 'NDA Signed'],
    ['qualified', 'Qualified'], ['negotiating', 'Negotiating'],
    ['closed_won', 'Closed — Won'], ['closed_lost', 'Closed — Lost'],
  ];
  const STATUSES = ['draft', 'active', 'under_offer', 'sold', 'withdrawn'];
  const LEAD_TYPES = ['inquiry', 'buyer', 'seller'];

  // ---------------- AUTH ----------------
  async function init() {
    if (cfg.BRAND_NAME) document.getElementById('admin-brand').textContent = cfg.BRAND_NAME;
    if (BK.isDemo) {
      document.getElementById('demo-banner').classList.remove('hidden');
      document.getElementById('login-sub').textContent = 'Demo mode — enter anything to sign in.';
    }
    const user = await BK.currentUser();
    if (user) showApp(); else showLogin();
  }

  function showLogin() { loginView.classList.remove('hidden'); appView.classList.add('hidden'); }
  function showApp() { loginView.classList.add('hidden'); appView.classList.remove('hidden'); renderTab(); }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.textContent = 'Signing in…';
    try { await BK.signIn(d.email, d.password); showApp(); }
    catch (err) { toast(err.message || 'Sign in failed', 'err'); }
    finally { btn.disabled = false; btn.textContent = 'Sign in'; }
  });
  document.getElementById('logout').addEventListener('click', async () => { await BK.signOut(); showLogin(); });

  document.querySelectorAll('.admin-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      document.querySelectorAll('.admin-tabs button').forEach((x) => x.classList.toggle('active', x === b));
      renderTab();
    }));

  function renderTab() {
    if (tab === 'listings') return renderListings();
    if (tab === 'brokers') return renderBrokers();
    if (tab === 'leads') return renderLeads();
    if (tab === 'ndas') return renderNdas();
  }

  // Cached so the listing editor can offer a broker dropdown.
  let brokerCache = [];
  async function loadBrokers() {
    try { brokerCache = await BK.adminListBrokers(); } catch (e) { brokerCache = []; }
    return brokerCache;
  }
  const brokerName = (id) => {
    const b = brokerCache.find((x) => x.id === id);
    return b ? b.name : null;
  };

  // ---------------- BROKERS ----------------
  async function renderBrokers() {
    main.innerHTML = '<div class="empty">Loading…</div>';
    const rows = await loadBrokers();
    main.innerHTML = `
      <div class="toolbar">
        <h2>Brokers <span class="muted" style="font-size:15px;font-weight:400">(${rows.length})</span></h2>
        <button class="btn btn-primary" id="new-broker">+ New Broker</button>
      </div>
      <table class="table">
        <thead><tr><th>Name</th><th>Title</th><th>Phone</th><th>Email</th><th>Public</th><th>Order</th><th></th></tr></thead>
        <tbody>
          ${rows.map((b) => `
            <tr>
              <td><strong>${esc(b.name)}</strong><div class="muted" style="font-size:12px">/broker/${esc(b.slug)}</div></td>
              <td>${esc(b.title || '—')}</td>
              <td>${esc(b.phone || '—')}</td>
              <td>${esc(b.email || '—')}</td>
              <td>${b.is_active ? '<span class="badge badge-active">Live</span>' : '<span class="badge badge-draft">Hidden</span>'}</td>
              <td>${esc(b.sort_order)}</td>
              <td><div class="row-actions">
                <button class="btn btn-ghost btn-sm" data-edit-b="${b.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-del-b="${b.id}">Delete</button>
              </div></td>
            </tr>`).join('') || '<tr><td colspan="7" class="muted" style="text-align:center;padding:30px">No brokers yet.</td></tr>'}
        </tbody>
      </table>
      <p class="form-note" style="margin-top:10px">Brokers appear on the public site at <code>/brokers</code>, each with a profile page listing the businesses they represent. Deleting a broker leaves their listings unassigned rather than removing them.</p>`;
    document.getElementById('new-broker').addEventListener('click', () => openBrokerEditor(null));
    main.querySelectorAll('[data-edit-b]').forEach((btn) => btn.addEventListener('click', () =>
      openBrokerEditor(rows.find((r) => r.id === btn.dataset.editB))));
    main.querySelectorAll('[data-del-b]').forEach((btn) => btn.addEventListener('click', async () => {
      const b = rows.find((r) => r.id === btn.dataset.delB);
      if (!confirm(`Delete ${b.name}? Their listings stay, but become unassigned.`)) return;
      try { await BK.deleteBroker(b.id); toast('Broker deleted', 'ok'); renderBrokers(); }
      catch (e) { toast(e.message, 'err'); }
    }));
  }

  function openBrokerEditor(broker) {
    const b = Object.assign({ is_active: true, sort_order: 0 }, broker || {});
    const isNew = !b.id;
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${isNew ? 'New Broker' : 'Edit Broker'}</h3><button class="modal-x">×</button></div>
        <div class="modal-body">
          <form id="broker-form">
            <div class="form-row">
              <div class="field"><label>Name *</label><input name="name" value="${esc(b.name)}" required/></div>
              <div class="field"><label>URL slug *</label><input name="slug" value="${esc(b.slug)}" placeholder="mary-lee" required/></div>
            </div>
            <div class="field"><label>Title</label><input name="title" value="${esc(b.title)}" placeholder="Licensed NYS Commercial &amp; Residential Broker"/></div>
            <div class="form-row">
              <div class="field"><label>Phone</label><input name="phone" value="${esc(b.phone)}"/></div>
              <div class="field"><label>Email</label><input name="email" value="${esc(b.email)}"/></div>
            </div>
            <div class="form-row">
              <div class="field"><label>License #</label><input name="license_no" value="${esc(b.license_no)}"/></div>
              <div class="field"><label>Sort order</label><input name="sort_order" type="number" value="${val(b.sort_order)}"/></div>
            </div>
            <div class="field"><label>Photo URL</label><input name="photo_url" value="${esc(b.photo_url)}" placeholder="https://… (Supabase Storage public URL)"/>
              <span class="form-note">Leave blank to show initials instead.</span></div>
            <div class="field"><label>Bio</label><textarea name="bio">${esc(b.bio)}</textarea></div>
            <label style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" name="is_active" ${b.is_active ? 'checked' : ''} style="width:auto"/> Show on the public site</label>
            <button class="btn btn-primary" type="submit">${isNew ? 'Create Broker' : 'Save Changes'}</button>
          </form>
        </div>
      </div>`;
    document.body.appendChild(back);
    back.querySelector('.modal-x').addEventListener('click', () => back.remove());
    back.querySelector('#broker-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      if (!d.name || !d.slug) return toast('Name and slug are required', 'err');
      const row = {
        id: b.id, name: d.name, slug: d.slug, title: d.title || null, phone: d.phone || null,
        email: d.email || null, license_no: d.license_no || null, photo_url: d.photo_url || null,
        bio: d.bio || null, is_active: !!d.is_active, sort_order: Number(d.sort_order || 0),
      };
      if (!row.id) delete row.id;
      try { await BK.saveBroker(row); toast('Broker saved', 'ok'); back.remove(); renderBrokers(); }
      catch (err) { toast(err.message, 'err'); }
    });
  }

  // ---------------- LISTINGS ----------------
  async function renderListings() {
    main.innerHTML = '<div class="empty">Loading…</div>';
    let rows;
    try {
      await loadBrokers();
      rows = await BK.adminListListings();
    } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    main.innerHTML = `
      <div class="toolbar">
        <h2>Listings <span class="muted" style="font-size:15px;font-weight:400">(${rows.length})</span></h2>
        <button class="btn btn-primary" id="new-listing">+ New Listing</button>
      </div>
      <table class="table">
        <thead><tr><th>Business</th><th>Status</th><th>Category</th><th>Location</th><th>Broker</th><th>Asking</th><th>Cash Flow</th><th></th></tr></thead>
        <tbody>
          ${rows.map((l) => `
            <tr>
              <td><strong>${esc(l.title)}</strong><div class="muted" style="font-size:12px">/${esc(l.slug)}</div></td>
              <td><span class="badge badge-${l.status}">${fmt.statusLabel(l.status)}</span></td>
              <td>${esc(l.category || '—')}</td>
              <td>${esc(fmt.location(l))}</td>
              <td>${(l.agents && l.agents.length)
                    ? l.agents.map((a, i) => `${esc(a.name)}${i === 0 && l.agents.length > 1 ? ' <span class="muted">(primary)</span>' : ''}`).join('<br/>')
                    : '<span class="muted">Unassigned</span>'}</td>
              <td>${esc(fmt.moneyOr(l.asking_price, '—'))}</td>
              <td>${esc(fmt.moneyOr(l.cash_flow, '—'))}</td>
              <td><div class="row-actions">
                <button class="btn btn-ghost btn-sm" data-edit="${l.id}">Edit</button>
                <button class="btn btn-danger btn-sm" data-del="${l.id}">Delete</button>
              </div></td>
            </tr>`).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:30px">No listings yet. Create your first one.</td></tr>'}
        </tbody>
      </table>`;
    document.getElementById('new-listing').addEventListener('click', () => openListingEditor(null));
    main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () =>
      openListingEditor(rows.find((r) => r.id === b.dataset.edit))));
    main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const l = rows.find((r) => r.id === b.dataset.del);
      if (!confirm(`Delete "${l.title}"? This cannot be undone.`)) return;
      try { await BK.deleteListing(l.id); toast('Listing deleted', 'ok'); renderListings(); }
      catch (e) { toast(e.message, 'err'); }
    }));
  }

  const TEXT_FIELDS = [
    ['title', 'Business Title *', 'text'], ['slug', 'URL Slug *', 'text'],
    ['headline', 'Headline / teaser', 'text'], ['category', 'Category / Industry', 'text'],
    ['city', 'City', 'text'], ['state', 'State', 'text'], ['county', 'County', 'text'],
    ['location_note', 'Location note (e.g. "disclosed after NDA")', 'text'],
    ['established_year', 'Year established', 'number'], ['employees', 'Employees', 'text'],
    ['real_estate', 'Real estate (Leased/Owned)', 'text'], ['building_sf', 'Building size', 'text'],
    ['lease_expiration', 'Lease expiration', 'text'],
  ];
  const MONEY_FIELDS = [
    ['asking_price', 'Asking price'], ['cash_flow', 'Cash flow (SDE)'], ['gross_revenue', 'Gross revenue'],
    ['ebitda', 'EBITDA'], ['ffe', 'FF&E value'], ['inventory', 'Inventory value'],
    ['real_estate_value', 'Real estate value'], ['rent', 'Monthly rent'],
  ];
  const LONG_FIELDS = [
    ['description', 'Business description'], ['reason_for_selling', 'Reason for selling'],
    ['support_training', 'Support & training'], ['growth_expansion', 'Growth & expansion'],
    ['competition', 'Competition'], ['facilities', 'Facilities'],
  ];

  function openListingEditor(listing) {
    const l = Object.assign({
      status: 'draft', is_featured: false, is_ffe_included: true, is_inventory_included: true,
      seller_financing: false, is_franchise: false,
    }, listing || {});
    const isNew = !l.id;

    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal" style="max-width:820px">
        <div class="modal-head"><h3>${isNew ? 'New Listing' : 'Edit Listing'}</h3><button class="modal-x">×</button></div>
        <div class="modal-body">
          <form id="listing-form">
            <div class="form-row">
              <div class="field"><label>Status</label>
                <select name="status">${STATUSES.map((s) => `<option value="${s}" ${l.status === s ? 'selected' : ''}>${fmt.statusLabel(s)}</option>`).join('')}</select>
                <span class="form-note">Active / Under Offer / Sold are publicly visible. Draft & Withdrawn are hidden.</span>
              </div>
              <div class="field"><label>Assigned agents</label>
                <div class="agent-picker" id="agent-picker">
                  <label class="agent-all"><input type="checkbox" id="agent-all"/> <strong>All agents</strong></label>
                  ${brokerCache.map((b) => {
                    const on = (l.agents || []).some((a) => a.id === b.id) || l.broker_id === b.id;
                    return `<label class="agent-opt">
                      <input type="checkbox" class="agent-cb" value="${b.id}" ${on ? 'checked' : ''}/>
                      <span>${esc(b.name)}</span>
                    </label>`;
                  }).join('') || '<p class="muted">No agents yet — add one on the Brokers tab.</p>'}
                </div>
                <div class="field" style="margin:10px 0 0">
                  <label>Primary contact</label>
                  <select name="primary_broker" id="primary-broker"></select>
                  <span class="form-note">Receives enquiries for this listing. All assigned agents are shown on it.</span>
                </div>
              </div>
            </div>
            <label style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" name="is_featured" ${l.is_featured ? 'checked' : ''} style="width:auto"/> Feature on the homepage</label>

            <h4 style="margin:6px 0">Overview</h4>
            ${TEXT_FIELDS.map((f) => fieldHTML(f, l)).join('')}

            <h4 style="margin:16px 0 6px">Financials</h4>
            <div class="form-row">${MONEY_FIELDS.map((f) =>
              `<div class="field"><label>${f[1]}</label><input name="${f[0]}" type="number" step="0.01" value="${val(l[f[0]])}"/></div>`).join('')}</div>
            <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px">
              <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="is_ffe_included" ${l.is_ffe_included ? 'checked' : ''} style="width:auto"/> FF&E included in price</label>
              <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="is_inventory_included" ${l.is_inventory_included ? 'checked' : ''} style="width:auto"/> Inventory included</label>
              <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="seller_financing" ${l.seller_financing ? 'checked' : ''} style="width:auto"/> Seller financing</label>
              <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="is_franchise" ${l.is_franchise ? 'checked' : ''} style="width:auto"/> Franchise</label>
            </div>

            <h4 style="margin:16px 0 6px">Description & Details</h4>
            ${LONG_FIELDS.map((f) => `<div class="field"><label>${f[1]}</label><textarea name="${f[0]}">${esc(l[f[0]])}</textarea></div>`).join('')}

            <button class="btn btn-primary" type="submit">${isNew ? 'Create Listing' : 'Save Changes'}</button>
          </form>

          ${isNew ? '<p class="form-note" style="margin-top:14px">Save the listing first, then reopen it to add photos and documents.</p>' : `
          <hr style="margin:24px 0;border:none;border-top:1px solid var(--line)"/>
          <h4>Photos</h4>
          <div id="img-area"></div>
          <hr style="margin:24px 0;border:none;border-top:1px solid var(--line)"/>
          <h4>Confidential Documents <span class="muted" style="font-weight:400;font-size:13px">— released after a buyer signs the NDA</span></h4>
          <div id="doc-area"></div>`}
        </div>
      </div>`;
    document.body.appendChild(back);
    const close = () => back.remove();
    back.querySelector('.modal-x').addEventListener('click', close);

    // ---- agent multi-select ----
    const cbs = [...back.querySelectorAll('.agent-cb')];
    const allCb = back.querySelector('#agent-all');
    const primarySel = back.querySelector('#primary-broker');

    // Keep "All agents" and the primary dropdown in step with the checkboxes.
    function syncAgents() {
      const chosen = cbs.filter((c) => c.checked);
      if (allCb) allCb.checked = cbs.length > 0 && chosen.length === cbs.length;
      const prev = primarySel.value || l.broker_id || '';
      primarySel.innerHTML = chosen.length
        ? chosen.map((c) => {
            const b = brokerCache.find((x) => x.id === c.value);
            return `<option value="${c.value}">${esc(b ? b.name : c.value)}</option>`;
          }).join('')
        : '<option value="">— Unassigned —</option>';
      // Preserve the current primary if it is still assigned.
      if (chosen.some((c) => c.value === prev)) primarySel.value = prev;
    }
    cbs.forEach((c) => c.addEventListener('change', syncAgents));
    if (allCb) allCb.addEventListener('change', () => {
      cbs.forEach((c) => { c.checked = allCb.checked; });
      syncAgents();
    });
    syncAgents();

    back.querySelector('#listing-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      if (!d.title || !d.slug) return toast('Title and slug are required', 'err');
      const row = { id: l.id };
      TEXT_FIELDS.forEach((f) => { row[f[0]] = d[f[0]] === '' ? null : (f[2] === 'number' ? Number(d[f[0]]) : d[f[0]]); });
      MONEY_FIELDS.forEach((f) => { row[f[0]] = d[f[0]] === '' ? null : Number(d[f[0]]); });
      LONG_FIELDS.forEach((f) => { row[f[0]] = d[f[0]] || null; });
      row.status = d.status;
      ['is_featured', 'is_ffe_included', 'is_inventory_included', 'seller_financing', 'is_franchise']
        .forEach((k) => { row[k] = !!d[k]; });

      // Primary first — setListingAgents treats agentIds[0] as the primary.
      const checked = cbs.filter((c) => c.checked).map((c) => c.value);
      const primary = primarySel.value || checked[0] || null;
      const agentIds = primary ? [primary, ...checked.filter((id) => id !== primary)] : checked;
      row.broker_id = primary;

      try {
        const saved = await BK.saveListing(row);
        const id = (saved && saved.id) || row.id;
        if (id) await BK.setListingAgents(id, agentIds);
        toast('Listing saved', 'ok');
        close(); renderListings();
        if (isNew && saved && saved.id) openListingEditor(saved); // reopen to add media
      } catch (err) { toast(err.message, 'err'); }
    });

    if (!isNew) { renderImages(back, l); renderDocs(back, l); }
  }

  function fieldHTML(f, l) {
    return `<div class="field"><label>${f[1]}</label><input name="${f[0]}" type="${f[2]}" ${f[2] === 'number' ? 'step="1"' : ''} value="${val(l[f[0]])}"/></div>`;
  }

  async function renderImages(back, l) {
    const area = back.querySelector('#img-area');
    const list = l.listing_images || [];
    area.innerHTML = `
      <div class="admin-grid" style="margin-bottom:12px">
        ${list.map((im, i) => `<div class="img-tile"><img src="${esc(im.url)}" alt=""/><button class="btn btn-danger btn-sm" data-img="${i}">✕</button></div>`).join('') || '<p class="muted">No photos yet.</p>'}
      </div>
      <div class="form-row">
        <div class="field"><label>Image URL</label><input id="img-url" placeholder="https://…  (or a Supabase Storage public URL)"/></div>
        <div class="field"><label>Caption</label><input id="img-cap"/></div>
      </div>
      <button class="btn btn-ghost btn-sm" id="add-img">+ Add photo</button>
      <p class="form-note" style="margin-top:8px">Tip: upload files to a public Supabase Storage bucket and paste the public URL here.</p>`;
    back.querySelector('#add-img').addEventListener('click', async () => {
      const url = back.querySelector('#img-url').value.trim();
      if (!url) return toast('Enter an image URL', 'err');
      try { await BK.addImage(l.id, url, back.querySelector('#img-cap').value.trim()); l.listing_images = await refreshImages(l.id); renderImages(back, l); toast('Photo added', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    });
    area.querySelectorAll('[data-img]').forEach((b) => b.addEventListener('click', async () => {
      try { await BK.deleteImage(list[Number(b.dataset.img)]); l.listing_images = await refreshImages(l.id); renderImages(back, l); }
      catch (e) { toast(e.message, 'err'); }
    }));
  }
  async function refreshImages(id) {
    const rows = await BK.adminListListings();
    const l = rows.find((r) => r.id === id);
    return (l && l.listing_images) || [];
  }

  async function renderDocs(back, l) {
    const area = back.querySelector('#doc-area');
    let docs = [];
    try { docs = await BK.listDocuments(l.id); } catch (e) {}
    area.innerHTML = `
      <div style="margin-bottom:12px">
        ${docs.map((d) => `<div class="finrow"><span class="k">📄 ${esc(d.name)} ${d.requires_nda ? '<span class="lead-type-tag inquiry">NDA</span>' : ''}</span>
          <button class="btn btn-danger btn-sm" data-doc="${d.id}">Remove</button></div>`).join('') || '<p class="muted">No documents yet.</p>'}
      </div>
      <div class="form-row">
        <div class="field"><label>Document name</label><input id="doc-name" placeholder="Confidential Information Memorandum"/></div>
        <div class="field"><label>File URL</label><input id="doc-url" placeholder="https://… (Supabase Storage)"/></div>
      </div>
      <label style="display:flex;gap:6px;align-items:center;margin-bottom:10px"><input type="checkbox" id="doc-nda" checked style="width:auto"/> Require signed NDA before release</label>
      <button class="btn btn-ghost btn-sm" id="add-doc">+ Add document</button>`;
    back.querySelector('#add-doc').addEventListener('click', async () => {
      const name = back.querySelector('#doc-name').value.trim();
      const url = back.querySelector('#doc-url').value.trim();
      if (!name || !url) return toast('Document name and URL are required', 'err');
      try {
        await BK.addDocument(l.id, { name, file_url: url, requires_nda: back.querySelector('#doc-nda').checked, is_available: true });
        renderDocs(back, l); toast('Document added', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });
    area.querySelectorAll('[data-doc]').forEach((b) => b.addEventListener('click', async () => {
      try { await BK.deleteDocument(docs.find((d) => d.id === b.dataset.doc)); renderDocs(back, l); }
      catch (e) { toast(e.message, 'err'); }
    }));
  }

  // ---------------- LEADS ----------------
  let leadCache = [];
  async function renderLeads() {
    main.innerHTML = '<div class="empty">Loading…</div>';
    try {
      await loadBrokers();
      listingCache = await BK.adminListListings();
      leadCache = await BK.listLeads();
    } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const byStage = {}; STAGES.forEach((s) => (byStage[s[0]] = []));
    leadCache.forEach((l) => { (byStage[l.stage] || (byStage[l.stage] = [])).push(l); });

    main.innerHTML = `
      <div class="toolbar">
        <h2>Leads <span class="muted" style="font-size:15px;font-weight:400">(${leadCache.length})</span></h2>
        <button class="btn btn-primary" id="new-lead">+ New Lead</button>
      </div>
      <div class="board">
        ${STAGES.map((s) => `
          <div class="col">
            <h4>${s[1]} <span>${(byStage[s[0]] || []).length}</span></h4>
            ${(byStage[s[0]] || []).map(leadCardHTML).join('')}
          </div>`).join('')}
      </div>`;
    document.getElementById('new-lead').addEventListener('click', () => openLeadEditor(null));
    main.querySelectorAll('[data-lead]').forEach((c) => c.addEventListener('click', () =>
      openLeadEditor(leadCache.find((l) => l.id === c.dataset.lead))));
  }

  function leadCardHTML(l) {
    const listing = findListingTitle(l.listing_id);
    const broker = brokerName(l.broker_id);
    return `<div class="lead-card ${l.type}" data-lead="${l.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
        <span class="ln">${esc(l.name)}</span>
        <span class="lead-type-tag ${l.type}">${l.type}</span>
      </div>
      <div class="lm">${esc(l.email || l.phone || '')}</div>
      ${listing ? `<div class="lm" style="color:var(--blue)">${esc(listing)}</div>` : ''}
      ${broker ? `<div class="lm">→ ${esc(broker)}</div>` : ''}
      <div class="lm">${esc((l.message || '').slice(0, 60))}</div>
    </div>`;
  }

  // Resolved from the real listings query (works live and in demo), not DEMO_LISTINGS.
  let listingCache = [];
  function findListingTitle(id) {
    if (!id) return null;
    const l = listingCache.find((x) => x.id === id);
    return l ? l.title : null;
  }

  function openLeadEditor(lead) {
    const l = Object.assign({ type: 'inquiry', stage: 'new' }, lead || {});
    const isNew = !l.id;
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal">
        <div class="modal-head"><h3>${isNew ? 'New Lead' : esc(l.name)}</h3><button class="modal-x">×</button></div>
        <div class="modal-body">
          <form id="lead-form">
            <div class="form-row">
              <div class="field"><label>Type</label><select name="type">${LEAD_TYPES.map((t) => `<option value="${t}" ${l.type === t ? 'selected' : ''}>${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
              <div class="field"><label>Stage</label><select name="stage">${STAGES.map((s) => `<option value="${s[0]}" ${l.stage === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}</select></div>
            </div>
            <div class="form-row">
              <div class="field"><label>Name *</label><input name="name" value="${esc(l.name)}" required/></div>
              <div class="field"><label>Email</label><input name="email" value="${esc(l.email)}"/></div>
            </div>
            <div class="form-row">
              <div class="field"><label>Phone</label><input name="phone" value="${esc(l.phone)}"/></div>
              <div class="field"><label>Company / Business</label><input name="company" value="${esc(l.company)}"/></div>
            </div>
            <div class="form-row">
              <div class="field"><label>Budget</label><input name="budget" value="${esc(l.budget)}"/></div>
              <div class="field"><label>Timeframe</label><input name="timeframe" value="${esc(l.timeframe)}"/></div>
            </div>
            <div class="field"><label>Message</label><textarea name="message">${esc(l.message)}</textarea></div>
            <div class="field"><label>Private notes</label><textarea name="notes" placeholder="Internal notes — never shown publicly">${esc(l.notes)}</textarea></div>
            ${l.listing_id ? `<p class="form-note">Interested in: <strong>${esc(findListingTitle(l.listing_id) || l.listing_id)}</strong></p>` : ''}
            ${l.created_at ? `<p class="form-note">Received ${esc(fmt.date(l.created_at))}${l.source ? ' · ' + esc(l.source) : ''}</p>` : ''}
            <button class="btn btn-primary" type="submit">${isNew ? 'Create Lead' : 'Save'}</button>
            ${l.email ? `<a class="btn btn-ghost" href="mailto:${esc(l.email)}" style="margin-left:8px">Email</a>` : ''}
            ${isNew ? '' : `<button class="btn btn-danger" type="button" id="lead-delete" style="float:right">Delete</button>`}
          </form>
        </div>
      </div>`;
    document.body.appendChild(back);
    back.querySelector('.modal-x').addEventListener('click', () => back.remove());

    const delBtn = back.querySelector('#lead-delete');
    if (delBtn) delBtn.addEventListener('click', async () => {
      if (!confirm(`Delete the lead from ${l.name}? This cannot be undone.`)) return;
      try { await BK.deleteLead(l.id); toast('Lead deleted', 'ok'); back.remove(); renderLeads(); }
      catch (err) { toast(err.message, 'err'); }
    });

    back.querySelector('#lead-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      if (!d.name) return toast('Name is required', 'err');
      try {
        if (isNew) await BK.createLead(d);
        else await BK.updateLead(l.id, d);
        toast('Lead saved', 'ok'); back.remove(); renderLeads();
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  // ---------------- NDAs ----------------
  async function renderNdas() {
    main.innerHTML = '<div class="empty">Loading…</div>';
    let rows = [];
    try {
      listingCache = await BK.adminListListings();
      rows = await BK.listNdas();
    } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    main.innerHTML = `
      <div class="toolbar"><h2>Signed NDAs <span class="muted" style="font-size:15px;font-weight:400">(${rows.length})</span></h2></div>
      ${BK.isDemo ? '<p class="muted">NDA signatures appear here once the site is live on Supabase. In demo mode, signing an NDA on the public site creates a buyer lead in the <strong>NDA Signed</strong> column instead.</p>' : ''}
      <table class="table">
        <thead><tr><th>Signer</th><th>Email</th><th>Phone</th><th>Listing</th><th>Signed</th></tr></thead>
        <tbody>
          ${rows.map((n) => `<tr><td><strong>${esc(n.signer_name)}</strong></td><td>${esc(n.signer_email)}</td><td>${esc(n.signer_phone || '—')}</td><td>${esc(findListingTitle(n.listing_id) || '—')}</td><td>${esc(fmt.date(n.signed_at))}</td></tr>`).join('')
            || (BK.isDemo ? '' : '<tr><td colspan="5" class="muted" style="text-align:center;padding:30px">No NDAs signed yet.</td></tr>')}
        </tbody>
      </table>`;
  }

  init();
})();
