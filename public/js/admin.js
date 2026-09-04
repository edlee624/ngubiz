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
  const BUSINESS_TYPES = (cfg.LEAD_BUSINESS_TYPES && cfg.LEAD_BUSINESS_TYPES.length)
    ? cfg.LEAD_BUSINESS_TYPES
    : ['Laundromat', 'Dry Cleaners', 'Restaurant / Café', 'Beauty Salon', 'Barbershop', 'Other'];

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
    if (tab === 'stats') return renderStats();
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
    let photoUrl = b.photo_url || '';
    back.innerHTML = `
      <div class="modal modal-wide">
        <div class="modal-head"><h3>${isNew ? 'New Broker' : 'Edit Broker'}</h3><button class="modal-x">×</button></div>
        <div class="modal-body">
          <form id="broker-form">
            <div class="editor-cols">
              <div>
                <h4 style="margin:0 0 10px">Photo</h4>
                <div class="photo-pick">
                  <div id="broker-photo-preview" class="photo-preview"></div>
                  <div class="photo-actions">
                    <label class="btn btn-ghost btn-sm">Upload photo
                      <input type="file" id="broker-photo-file" accept="image/*" hidden/>
                    </label>
                    <button type="button" class="btn btn-danger btn-sm" id="broker-photo-remove">Remove</button>
                  </div>
                  <span class="form-note">JPG or PNG, up to 8 MB. Shown square, so a head-and-shoulders crop works best. With no photo, initials are shown instead.</span>
                </div>
              </div>
              <div>
                <div class="field"><label>Name *</label><input name="name" id="broker-name" value="${esc(b.name)}" required/></div>
                <div class="field"><label>URL slug</label>
                  <input name="slug" id="broker-slug" value="${esc(b.slug)}" placeholder="generated from the name"/>
                  <span class="form-note" id="slug-note">${isNew ? 'Filled in automatically as you type the name.' : `Profile: /broker/${esc(b.slug)}`}</span>
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
              </div>
            </div>

            <div class="field" style="margin-top:6px"><label>Bio</label>
              <textarea name="bio" class="bio-box">${esc(b.bio)}</textarea>
            </div>
            <label style="display:flex;gap:8px;align-items:center;margin-bottom:14px"><input type="checkbox" name="is_active" ${b.is_active ? 'checked' : ''} style="width:auto"/> Show on the public site</label>
            <button class="btn btn-primary" type="submit">${isNew ? 'Create Broker' : 'Save Changes'}</button>
          </form>
        </div>
      </div>`;
    document.body.appendChild(back);
    back.querySelector('.modal-x').addEventListener('click', () => back.remove());

    // ---- photo: preview, upload, remove ----
    const preview = back.querySelector('#broker-photo-preview');
    const fileInput = back.querySelector('#broker-photo-file');
    function paintPhoto() {
      preview.innerHTML = photoUrl
        ? `<img src="${esc(photoUrl)}" alt=""/>`
        : `<span>${esc((back.querySelector('#broker-name').value || '?').split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span>`;
      back.querySelector('#broker-photo-remove').disabled = !photoUrl;
    }
    paintPhoto();

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      const label = fileInput.parentElement;
      const old = label.textContent; label.style.opacity = .6; label.firstChild.nodeValue = 'Uploading… ';
      try {
        const url = await BK.uploadImage(file, 'brokers');
        photoUrl = url; paintPhoto(); toast('Photo uploaded — remember to save', 'ok');
      } catch (err) { toast(err.message, 'err'); }
      finally { label.style.opacity = 1; label.firstChild.nodeValue = 'Upload photo '; fileInput.value = ''; }
    });

    back.querySelector('#broker-photo-remove').addEventListener('click', async () => {
      if (!photoUrl) return;
      if (!confirm('Remove this photo? Initials will be shown instead.')) return;
      try { await BK.deleteUpload(photoUrl); } catch (e) { /* file may not be ours */ }
      photoUrl = ''; paintPhoto(); toast('Photo removed — remember to save', 'ok');
    });

    // ---- slug generated from the name ----
    const nameInput = back.querySelector('#broker-name');
    const slugInput = back.querySelector('#broker-slug');
    // Only auto-fill while the slug is untouched, so a hand-picked one sticks.
    let slugTouched = !isNew && !!b.slug;
    slugInput.addEventListener('input', () => { slugTouched = true; });
    nameInput.addEventListener('input', () => {
      if (!slugTouched) slugInput.value = slugify(nameInput.value);
      if (!photoUrl) paintPhoto();
    });

    back.querySelector('#broker-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.target).entries());
      if (!d.name || !d.name.trim()) return toast('Name is required', 'err');
      const slug = (d.slug || '').trim() || slugify(d.name);
      const row = {
        id: b.id, name: d.name.trim(), slug, title: d.title || null, phone: d.phone || null,
        email: d.email || null, license_no: d.license_no || null, photo_url: photoUrl || null,
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
      listingCache = rows;   // uniqueSlug() needs the existing slugs
    } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    main.innerHTML = `
      <div class="toolbar">
        <h2>Listings <span class="muted" style="font-size:15px;font-weight:400">(${rows.length})</span></h2>
        <button class="btn btn-primary" id="new-listing">+ New Listing</button>
      </div>
      <p class="form-note" style="margin:-6px 0 12px">Use ▲▼ to set the order listings appear on the site.</p>
      <table class="table">
        <thead><tr><th>Order</th><th>Business</th><th>Status</th><th>Category</th><th>Location</th><th>Broker</th><th>Asking</th><th>Cash Flow</th><th></th></tr></thead>
        <tbody>
          ${rows.map((l, idx) => `
            <tr>
              <td class="reorder-cell">
                <button class="reorder-btn" data-up="${l.id}" ${idx === 0 ? 'disabled' : ''} title="Move up" aria-label="Move up">▲</button>
                <button class="reorder-btn" data-down="${l.id}" ${idx === rows.length - 1 ? 'disabled' : ''} title="Move down" aria-label="Move down">▼</button>
              </td>
              <td><strong>${esc(l.title)}</strong>${l.is_featured ? ' <span class="badge badge-featured" style="font-size:10px">Featured</span>' : ''}<div class="muted" style="font-size:12px">/${esc(l.slug)}</div></td>
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
            </tr>`).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;padding:30px">No listings yet. Create your first one.</td></tr>'}
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
    main.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => moveListing(rows, b.dataset.up, -1)));
    main.querySelectorAll('[data-down]').forEach((b) => b.addEventListener('click', () => moveListing(rows, b.dataset.down, 1)));
  }

  // Reorder listings: swap with the neighbour, renumber, persist the ones that
  // changed, then re-render from the (now reordered) source of truth.
  async function moveListing(rows, id, delta) {
    const i = rows.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= rows.length) return;
    const tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
    const changed = [];
    rows.forEach((r, idx) => { if (r.sort_order !== idx) { r.sort_order = idx; changed.push(r); } });
    try {
      await Promise.all(changed.map((r) => BK.setListingSort(r.id, r.sort_order)));
      renderListings();
    } catch (e) { toast(e.message || 'Could not reorder', 'err'); renderListings(); }
  }

  // The form is deliberately small: title, five financial figures, description.
  // Columns NOT listed here (category, city, headline, facilities, …) still
  // exist and still render on the site — the save below simply never touches
  // them, so editing a listing can't wipe data the form doesn't show.
  const MONEY_FIELDS = [
    ['asking_price', 'Asking price'], ['cash_flow', 'Cash flow'],
    ['gross_revenue', 'Gross revenue'], ['rent', 'Rent (monthly)'],
  ];

  // Title -> URL slug, so there's no slug field to fill in by hand.
  function slugify(s) {
    return String(s || '')
      // Fold accents first, so "Café" -> "cafe" rather than "caf".
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim()
      .replace(/['’]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60).replace(/-+$/, '') || 'listing';
  }
  // Slugs are UNIQUE in the schema, so avoid colliding with an existing one.
  function uniqueSlug(title, ownId) {
    const base = slugify(title);
    const taken = new Set(listingCache.filter((x) => x.id !== ownId).map((x) => x.slug));
    if (!taken.has(base)) return base;
    for (let i = 2; i < 500; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
    return `${base}-${Date.now()}`;
  }

  function openListingEditor(listing) {
    const l = Object.assign({ status: 'draft' }, listing || {});
    const isNew = !l.id;

    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <div class="modal modal-wide">
        <div class="modal-head"><h3>${isNew ? 'New Listing' : 'Edit Listing'}</h3><button class="modal-x">×</button></div>
        <div class="modal-body">
          <form id="listing-form">
            <div class="form-row">
              <div class="field"><label>Status</label>
                <select name="status">${STATUSES.map((s) => `<option value="${s}" ${l.status === s ? 'selected' : ''}>${fmt.statusLabel(s)}</option>`).join('')}</select>
                <span class="form-note">Active / Under Offer / Sold are publicly visible. Draft & Withdrawn are hidden.</span>
                <label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-weight:500">
                  <input type="checkbox" name="is_featured" ${l.is_featured ? 'checked' : ''} style="width:auto"/>
                  Feature on the homepage
                </label>
                <span class="form-note">Shows this listing in the “Featured Listings” section on the home page.</span>
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
            <div class="field"><label>Business title *</label>
              <input name="title" value="${esc(l.title)}" required placeholder="Laundromat – Large Space, Long Lease"/>
              ${isNew ? '<span class="form-note">The web address is generated from this.</span>'
                      : `<span class="form-note">Address: /listing/${esc(l.slug)}</span>`}
            </div>

            <h4 style="margin:18px 0 6px">Financials</h4>
            <div class="form-row">${MONEY_FIELDS.map((f) =>
              `<div class="field"><label>${f[1]}</label><input name="${f[0]}" type="number" step="1" value="${val(l[f[0]])}" placeholder="—"/></div>`).join('')}</div>
            <div class="field"><label>Lease</label>
              <input name="lease_expiration" value="${esc(l.lease_expiration)}" placeholder="10-year lease remaining"/>
            </div>
            <p class="form-note" style="margin:-4px 0 4px">Leave a figure blank and it is simply left off the listing.</p>

            <h4 style="margin:18px 0 6px">Business description</h4>
            <div class="field">
              <textarea name="description" style="min-height:200px" placeholder="Describe the business…">${esc(l.description)}</textarea>
            </div>

            <button class="btn btn-primary" type="submit">${isNew ? 'Create Listing' : 'Save Changes'}</button>
          </form>

          ${isNew ? '<p class="form-note" style="margin-top:14px">Save the listing first, then reopen it to add photos.</p>' : `
          <hr style="margin:24px 0;border:none;border-top:1px solid var(--line)"/>
          <h4>Photos</h4>
          <div id="img-area"></div>`}
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
      if (!d.title || !d.title.trim()) return toast('Business title is required', 'err');

      // Only the fields this form actually shows. Anything else on the row
      // (category, city, headline, facilities, …) is left untouched so an edit
      // here can never blank out data the form doesn't display.
      const row = {
        id: l.id,
        title: d.title.trim(),
        status: d.status,
        is_featured: !!d.is_featured,
        lease_expiration: d.lease_expiration.trim() || null,
        description: d.description.trim() || null,
      };
      MONEY_FIELDS.forEach((f) => { row[f[0]] = d[f[0]] === '' ? null : Number(d[f[0]]); });
      // Slug is derived from the title, and only for new listings — changing it
      // on an existing one would break any link already shared.
      if (!l.id) row.slug = uniqueSlug(d.title, null);

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

    if (!isNew) renderImages(back, l);
  }

  async function renderImages(back, l) {
    const area = back.querySelector('#img-area');
    const list = l.listing_images || [];
    area.innerHTML = `
      <div class="admin-grid" style="margin-bottom:14px">
        ${list.map((im, i) => `<div class="img-tile">
            <img src="${esc(im.url)}" alt=""/>
            <button class="btn btn-danger btn-sm" data-img="${i}" title="Delete photo">✕</button>
          </div>`).join('') || '<p class="muted">No photos yet.</p>'}
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <label class="btn btn-ghost btn-sm">Upload photo
          <input type="file" id="img-file" accept="image/*" hidden multiple/>
        </label>
        <button type="button" class="btn btn-ghost btn-sm" id="img-by-url">Add by URL</button>
      </div>
      <div id="img-url-row" class="form-row hidden" style="margin-top:10px">
        <div class="field"><label>Image URL</label><input id="img-url" placeholder="https://…"/></div>
        <div class="field"><label>Caption</label><input id="img-cap"/></div>
      </div>
      <div id="img-url-add" class="hidden" style="margin-top:4px">
        <button type="button" class="btn btn-ghost btn-sm" id="add-img">Add</button>
      </div>
      <p class="form-note" style="margin-top:8px">JPG or PNG, up to 8 MB each. You can select several at once. The first photo is the one shown on listing cards.</p>`;

    // upload one or more files
    const fileInput = back.querySelector('#img-file');
    fileInput.addEventListener('change', async () => {
      const files = [...(fileInput.files || [])];
      if (!files.length) return;
      const label = fileInput.parentElement;
      label.style.opacity = .6; label.firstChild.nodeValue = `Uploading 0/${files.length} `;
      let done = 0;
      try {
        for (const f of files) {
          const url = await BK.uploadImage(f, 'listings');
          await BK.addImage(l.id, url, null);
          label.firstChild.nodeValue = `Uploading ${++done}/${files.length} `;
        }
        l.listing_images = await refreshImages(l.id);
        renderImages(back, l);
        toast(done === 1 ? 'Photo uploaded' : `${done} photos uploaded`, 'ok');
      } catch (e) {
        toast(e.message, 'err');
        l.listing_images = await refreshImages(l.id);
        renderImages(back, l);
      }
    });

    // optional add-by-URL, hidden until asked for
    back.querySelector('#img-by-url').addEventListener('click', () => {
      back.querySelector('#img-url-row').classList.toggle('hidden');
      back.querySelector('#img-url-add').classList.toggle('hidden');
    });
    back.querySelector('#add-img').addEventListener('click', async () => {
      const url = back.querySelector('#img-url').value.trim();
      if (!url) return toast('Enter an image URL', 'err');
      try {
        await BK.addImage(l.id, url, back.querySelector('#img-cap').value.trim());
        l.listing_images = await refreshImages(l.id);
        renderImages(back, l); toast('Photo added', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });

    // delete
    area.querySelectorAll('[data-img]').forEach((btn) => btn.addEventListener('click', async () => {
      const im = list[Number(btn.dataset.img)];
      if (!confirm('Delete this photo?')) return;
      try {
        await BK.deleteImage(im);
        await BK.deleteUpload(im.url);          // also drop the file if we uploaded it
        l.listing_images = await refreshImages(l.id);
        renderImages(back, l); toast('Photo deleted', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    }));
  }
  async function refreshImages(id) {
    const rows = await BK.adminListListings();
    const l = rows.find((r) => r.id === id);
    return (l && l.listing_images) || [];
  }


  // ---------------- LEADS ----------------
  let leadCache = [];
  const leadFilters = { q: '', category: '', minInvest: '' };

  async function renderLeads() {
    main.innerHTML = '<div class="empty">Loading…</div>';
    try {
      await loadBrokers();
      listingCache = await BK.adminListListings();
      leadCache = await BK.listLeads();
    } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }

    main.innerHTML = `
      <div class="toolbar">
        <h2>Leads <span class="muted" style="font-size:15px;font-weight:400" id="lead-count">(${leadCache.length})</span></h2>
        <button class="btn btn-primary" id="new-lead">+ New Lead</button>
      </div>
      <div class="lead-filters">
        <input id="lead-q" type="search" placeholder="Search name, email, company…" value="${esc(leadFilters.q)}"/>
        <select id="lead-cat">
          <option value="">Any business type</option>
          ${BUSINESS_TYPES.map((t) => `<option value="${esc(t)}" ${leadFilters.category === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
        <input id="lead-invest" type="number" step="1000" min="0" placeholder="Min investment $" value="${esc(leadFilters.minInvest)}"/>
        <button class="btn btn-ghost btn-sm" id="lead-clear">Clear</button>
      </div>
      <div class="board" id="lead-board"></div>`;

    document.getElementById('new-lead').addEventListener('click', () => openLeadEditor(null));
    const q = document.getElementById('lead-q');
    const cat = document.getElementById('lead-cat');
    const inv = document.getElementById('lead-invest');
    q.addEventListener('input', () => { leadFilters.q = q.value; applyLeadFilters(); });
    cat.addEventListener('change', () => { leadFilters.category = cat.value; applyLeadFilters(); });
    inv.addEventListener('input', () => { leadFilters.minInvest = inv.value; applyLeadFilters(); });
    document.getElementById('lead-clear').addEventListener('click', () => {
      leadFilters.q = ''; leadFilters.category = ''; leadFilters.minInvest = '';
      q.value = ''; cat.value = ''; inv.value = ''; applyLeadFilters();
    });
    applyLeadFilters();
  }

  function leadMatches(l) {
    const f = leadFilters;
    if (f.q) {
      const hay = [l.name, l.email, l.company, l.phone, l.message].filter(Boolean).join(' ').toLowerCase();
      if (hay.indexOf(f.q.toLowerCase()) === -1) return false;
    }
    if (f.category && (l.interested_categories || []).indexOf(f.category) === -1) return false;
    if (f.minInvest !== '' && !isNaN(Number(f.minInvest))) {
      if (l.investment_amount == null || Number(l.investment_amount) < Number(f.minInvest)) return false;
    }
    return true;
  }

  function applyLeadFilters() {
    const board = document.getElementById('lead-board');
    if (!board) return;
    const shown = leadCache.filter(leadMatches);
    const byStage = {}; STAGES.forEach((s) => (byStage[s[0]] = []));
    shown.forEach((l) => { (byStage[l.stage] || (byStage[l.stage] = [])).push(l); });

    board.innerHTML = STAGES.map((s) => `
      <div class="col">
        <h4>${s[1]} <span>${(byStage[s[0]] || []).length}</span></h4>
        ${(byStage[s[0]] || []).map(leadCardHTML).join('')}
      </div>`).join('');

    const active = leadFilters.q || leadFilters.category || leadFilters.minInvest !== '';
    const cnt = document.getElementById('lead-count');
    if (cnt) cnt.textContent = active ? `(${shown.length} of ${leadCache.length})` : `(${leadCache.length})`;

    board.querySelectorAll('[data-lead]').forEach((c) => c.addEventListener('click', () =>
      openLeadEditor(leadCache.find((l) => l.id === c.dataset.lead))));
  }

  function leadCardHTML(l) {
    const listing = findListingTitle(l.listing_id);
    const broker = brokerName(l.broker_id);
    const cats = (l.interested_categories || []);
    return `<div class="lead-card ${l.type}" data-lead="${l.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
        <span class="ln">${esc(l.name)}</span>
        <span class="lead-type-tag ${l.type}">${l.type}</span>
      </div>
      <div class="lm">${esc(l.email || l.phone || '')}</div>
      ${listing ? `<div class="lm" style="color:var(--blue)">${esc(listing)}</div>` : ''}
      ${broker ? `<div class="lm">→ ${esc(broker)}</div>` : ''}
      ${l.investment_amount != null ? `<div class="lm" style="color:var(--green);font-weight:600">${esc(fmt.moneyOr(l.investment_amount))} to invest</div>` : ''}
      ${cats.length ? `<div class="lead-cats">${cats.slice(0, 3).map((c) => `<span class="lead-cat-chip">${esc(c)}</span>`).join('')}${cats.length > 3 ? ` +${cats.length - 3}` : ''}</div>` : ''}
      ${!l.investment_amount && !cats.length ? `<div class="lm">${esc((l.message || '').slice(0, 60))}</div>` : ''}
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
              <div class="field"><label>Investment amount (USD)</label>
                <input name="investment_amount" type="number" step="1000" min="0"
                  value="${val(l.investment_amount)}" placeholder="e.g. 300000"/>
                <span class="form-note">What they're prepared to invest. Searchable.</span>
              </div>
              <div class="field"><label>Timeframe</label><input name="timeframe" value="${esc(l.timeframe)}"/></div>
            </div>
            <div class="field"><label>Business types of interest</label>
              <div class="type-picker">
                ${BUSINESS_TYPES.map((t) => `<label class="type-opt">
                  <input type="checkbox" name="interested_categories" value="${esc(t)}" ${(l.interested_categories || []).indexOf(t) !== -1 ? 'checked' : ''}/>
                  <span>${esc(t)}</span>
                </label>`).join('')}
              </div>
            </div>
            <div class="field"><label>Budget / other notes</label><input name="budget" value="${esc(l.budget)}"/></div>
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
      const fd = new FormData(e.target);
      const d = Object.fromEntries(fd.entries());
      if (!d.name) return toast('Name is required', 'err');
      // Checkboxes: fromEntries keeps only the last, so pull all of them.
      d.interested_categories = fd.getAll('interested_categories');
      d.investment_amount = d.investment_amount === '' ? null : Number(d.investment_amount);
      try {
        if (isNew) await BK.createLead(d);
        else await BK.updateLead(l.id, d);
        toast('Lead saved', 'ok'); back.remove(); renderLeads();
      } catch (err) { toast(err.message, 'err'); }
    });
  }

  // ---------------- STATS ----------------
  let statsDays = 30;

  // Turn a raw path into something readable in the top-pages table.
  function pathLabel(p) {
    if (p === '/' ) return 'Home';
    if (p === '/listings') return 'Listings';
    if (p === '/brokers') return 'About Us';
    if (p === '/sell') return 'Sell a Business';
    let m = p.match(/^\/listing\/(.+)$/);
    if (m) { const l = listingCache.find((x) => x.slug === m[1]); return (l ? l.title : m[1]) + ' (listing)'; }
    m = p.match(/^\/broker\/(.+)$/);
    if (m) { const b = brokerCache.find((x) => x.slug === m[1]); return (b ? b.name : m[1]) + ' (broker)'; }
    return p;
  }

  async function renderStats() {
    main.innerHTML = '<div class="empty">Loading…</div>';
    let s;
    try {
      // Labels need listings + brokers resolved.
      await loadBrokers();
      listingCache = await BK.adminListListings();
      s = await BK.getViewStats(statsDays);
    } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }

    // Fill day gaps so the chart shows a continuous run of days (zeros included).
    const counts = {};
    (s.by_day || []).forEach((d) => { counts[d.day] = d.views; });
    const days = [];
    const today = new Date();
    for (let i = statsDays - 1; i >= 0; i--) {
      const dt = new Date(today.getTime() - i * 86400000);
      const key = dt.toISOString().slice(0, 10);
      days.push({ key, label: dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), views: counts[key] || 0 });
    }
    const peak = Math.max(1, ...days.map((d) => d.views));
    const empty = (s.total_all_time || 0) === 0;

    main.innerHTML = `
      <div class="toolbar">
        <h2>Visit stats</h2>
        <div class="stat-range">
          ${[7, 30, 90].map((n) => `<button class="btn btn-sm ${statsDays === n ? 'btn-primary' : 'btn-ghost'}" data-range="${n}">${n}d</button>`).join('')}
        </div>
      </div>

      ${empty ? '<p class="muted" style="margin:0 0 16px">No visits recorded yet. Numbers will appear here as people browse the public site.</p>' : ''}

      <div class="stat-cards">
        <div class="stat-card"><div class="stat-num">${(s.total || 0).toLocaleString()}</div><div class="stat-lbl">Page views · last ${statsDays} days</div></div>
        <div class="stat-card"><div class="stat-num">${(s.visitors || 0).toLocaleString()}</div><div class="stat-lbl">Unique visitors · last ${statsDays} days</div></div>
        <div class="stat-card"><div class="stat-num">${(s.total_all_time || 0).toLocaleString()}</div><div class="stat-lbl">All-time page views</div></div>
      </div>

      <div class="stat-panel">
        <h3>Views per day</h3>
        <div class="stat-chart" style="--peak:${peak}">
          ${days.map((d) => `<div class="stat-bar" title="${esc(d.label)}: ${d.views}">
            <div class="stat-bar-fill" style="height:${Math.round((d.views / peak) * 100)}%"></div>
          </div>`).join('')}
        </div>
        <div class="stat-axis"><span>${esc(days[0].label)}</span><span>${esc(days[days.length - 1].label)}</span></div>
      </div>

      <div class="stat-panel">
        <h3>Most viewed pages · last ${statsDays} days</h3>
        <table class="table">
          <thead><tr><th>Page</th><th style="text-align:right">Views</th></tr></thead>
          <tbody>
            ${(s.top_paths || []).length
              ? s.top_paths.map((r) => `<tr><td>${esc(pathLabel(r.path))}<div class="muted" style="font-size:12px">${esc(r.path)}</div></td><td style="text-align:right;font-weight:700">${(r.views || 0).toLocaleString()}</td></tr>`).join('')
              : '<tr><td colspan="2" class="muted" style="text-align:center;padding:24px">No page views in this window.</td></tr>'}
          </tbody>
        </table>
      </div>

      <p class="form-note" style="margin-top:12px">Counts every page the public site loads. Visitors are de-duplicated by a random, cookie-free id kept in each browser. The admin isn't tracked.</p>`;

    main.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
      statsDays = Number(b.dataset.range); renderStats();
    }));
  }

  init();
})();
