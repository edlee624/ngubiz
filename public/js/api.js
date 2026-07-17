// Data layer for the Business Brokerage CMS.
//
// One adapter, two backends:
//   • LIVE  — talks to Supabase (config.js has real keys). RLS + RPCs enforce
//             who can read/write what.
//   • DEMO  — config.js still has placeholders. Reads come from demo-data.js;
//             writes are simulated in memory so you can click through the whole
//             app (public + admin) without a backend. Nothing persists on reload.
//
// Everything hangs off a single global: window.BK
(function () {
  const cfg = window.BROKERAGE_CONFIG || {};
  const configured =
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes('YOUR-') &&
    !cfg.SUPABASE_ANON_KEY.includes('YOUR-');

  let sb = null;
  if (configured && window.supabase) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  // ---- formatting helpers (shared by public + admin) ----------------------
  const fmt = {
    money(n) {
      if (n === null || n === undefined || n === '' || isNaN(n)) return null;
      return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    },
    moneyOr(n, dash) {
      return fmt.money(n) || (dash || 'On request');
    },
    date(s) {
      if (!s) return '';
      try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
      catch (e) { return s; }
    },
    location(l) {
      return [l.city, l.state].filter(Boolean).join(', ') || l.location_note || '—';
    },
    statusLabel(s) {
      return { active: 'Active', under_offer: 'Under Offer', sold: 'Sold', draft: 'Draft', withdrawn: 'Withdrawn' }[s] || s;
    },
  };

  const LIVE_STATUSES = ['active', 'under_offer', 'sold'];

  // ---- DEMO helpers -------------------------------------------------------
  function demoAll() { return (window.DEMO_LISTINGS || []).map((l) => Object.assign({}, l)); }
  function demoLive() { return demoAll().filter((l) => LIVE_STATUSES.indexOf(l.status) !== -1); }

  // Simulated auth + lead store for demo admin.
  const demoState = { signedIn: false, leads: seedDemoLeads() };
  function seedDemoLeads() {
    return [
      { id: 'l1', type: 'buyer', stage: 'qualified', name: 'Jordan Ellis', email: 'jordan@example.com', phone: '(555) 200-1010', listing_id: 'demo-1', message: 'Interested in the salon — have funds ready.', budget: '$300k–$450k', timeframe: '60 days', source: 'website', created_at: '2026-06-28T15:00:00Z' },
      { id: 'l2', type: 'seller', stage: 'new', name: 'Pat Morgan', email: 'pat@example.com', phone: '(555) 200-2020', listing_id: null, message: 'I own a landscaping company and may want to sell next year.', budget: '', timeframe: '6–12 months', source: 'website', created_at: '2026-07-01T18:30:00Z' },
      { id: 'l3', type: 'inquiry', stage: 'contacted', name: 'Sam Rivera', email: 'sam@example.com', phone: '', listing_id: 'demo-3', message: 'Is seller financing negotiable on the HVAC business?', budget: '', timeframe: '', source: 'website', created_at: '2026-07-03T12:10:00Z' },
      { id: 'l4', type: 'buyer', stage: 'nda_signed', name: 'Alex Chen', email: 'alex@example.com', phone: '(555) 200-4040', listing_id: 'demo-2', message: 'Signed NDA to access documents', budget: '', timeframe: '', source: 'website', created_at: '2026-07-04T09:45:00Z' },
    ];
  }
  function uid() { return 'x' + Math.abs(Date.now() ^ (Math.floor(performance.now() * 1000))).toString(36); }

  async function wrap(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(error.message || 'Request failed');
    return data;
  }

  const BK = {
    isDemo: !configured,
    configured,
    config: cfg,
    fmt,
    LIVE_STATUSES,

    // ===================== AUTH (admin) ==================================
    async signIn(email, password) {
      if (this.isDemo) { demoState.signedIn = true; return { demo: true }; }
      return wrap(sb.auth.signInWithPassword({ email, password }));
    },
    async signOut() {
      if (this.isDemo) { demoState.signedIn = false; return; }
      await sb.auth.signOut();
    },
    async currentUser() {
      if (this.isDemo) return demoState.signedIn ? { email: 'demo@local', demo: true } : null;
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.user : null;
    },

    // ===================== PUBLIC READS ==================================
    async listPublicListings() {
      if (this.isDemo) return demoLive();
      return wrap(
        sb.from('listings')
          .select('*, listing_images(*)')
          .in('status', LIVE_STATUSES)
          .order('is_featured', { ascending: false })
          .order('updated_at', { ascending: false })
      );
    },
    async getListingBySlug(slug) {
      if (this.isDemo) return demoLive().find((l) => l.slug === slug) || null;
      const rows = await wrap(
        sb.from('listings').select('*, listing_images(*)').eq('slug', slug).limit(1)
      );
      return rows && rows[0] ? rows[0] : null;
    },

    // ===================== PUBLIC WRITES (RPCs) ==========================
    async submitInquiry(p) {
      if (this.isDemo) {
        demoState.leads.unshift({
          id: uid(), type: p.type || 'inquiry', stage: 'new', name: p.name, email: p.email,
          phone: p.phone || '', listing_id: p.listing_id || null, message: p.message || '',
          source: 'website', created_at: new Date().toISOString(),
        });
        return;
      }
      await wrap(sb.rpc('submit_inquiry', {
        p_name: p.name, p_email: p.email, p_message: p.message || '',
        p_phone: p.phone || null, p_listing_id: p.listing_id || null, p_type: p.type || 'inquiry',
      }));
    },
    async signNda(p) {
      if (this.isDemo) {
        const l = demoAll().find((x) => x.id === p.listing_id);
        demoState.leads.unshift({
          id: uid(), type: 'buyer', stage: 'nda_signed', name: p.name, email: p.email,
          phone: p.phone || '', listing_id: p.listing_id, message: 'Signed NDA to access documents',
          source: 'website', created_at: new Date().toISOString(),
        });
        return (l && l.documents) || [];
      }
      return wrap(sb.rpc('sign_nda', {
        p_listing_id: p.listing_id, p_name: p.name, p_email: p.email, p_phone: p.phone || null,
      }));
    },

    // ===================== ADMIN: LISTINGS ===============================
    async adminListListings() {
      if (this.isDemo) return demoAll();
      return wrap(sb.from('listings').select('*, listing_images(*)').order('updated_at', { ascending: false }));
    },
    async saveListing(row) {
      if (this.isDemo) {
        const all = window.DEMO_LISTINGS;
        if (row.id) {
          const i = all.findIndex((x) => x.id === row.id);
          if (i !== -1) all[i] = Object.assign(all[i], row);
        } else {
          row.id = uid(); row.listing_images = row.listing_images || [];
          all.unshift(row);
        }
        return row;
      }
      const payload = Object.assign({}, row);
      delete payload.listing_images; delete payload.documents;
      if (row.id) return wrap(sb.from('listings').update(payload).eq('id', row.id).select().single());
      return wrap(sb.from('listings').insert(payload).select().single());
    },
    async deleteListing(id) {
      if (this.isDemo) {
        const all = window.DEMO_LISTINGS; const i = all.findIndex((x) => x.id === id);
        if (i !== -1) all.splice(i, 1); return;
      }
      await wrap(sb.from('listings').delete().eq('id', id));
    },

    // ===================== ADMIN: IMAGES =================================
    async addImage(listingId, url, caption) {
      if (this.isDemo) {
        const l = window.DEMO_LISTINGS.find((x) => x.id === listingId);
        if (l) { l.listing_images = l.listing_images || []; l.listing_images.push({ url, caption, sort_order: l.listing_images.length }); }
        return;
      }
      await wrap(sb.from('listing_images').insert({ listing_id: listingId, url, caption: caption || null }));
    },
    async deleteImage(img) {
      if (this.isDemo) {
        window.DEMO_LISTINGS.forEach((l) => {
          if (l.listing_images) l.listing_images = l.listing_images.filter((im) => im !== img && im.id !== img.id);
        });
        return;
      }
      await wrap(sb.from('listing_images').delete().eq('id', img.id));
    },

    // ===================== ADMIN: DOCUMENTS =============================
    async listDocuments(listingId) {
      if (this.isDemo) {
        const l = window.DEMO_LISTINGS.find((x) => x.id === listingId);
        return ((l && l.documents) || []).map((d) => Object.assign({}, d));
      }
      return wrap(sb.from('documents').select('*').eq('listing_id', listingId).order('sort_order'));
    },
    async addDocument(listingId, row) {
      if (this.isDemo) {
        const l = window.DEMO_LISTINGS.find((x) => x.id === listingId);
        if (l) { l.documents = l.documents || []; l.documents.push(Object.assign({ id: uid() }, row)); }
        return;
      }
      await wrap(sb.from('documents').insert(Object.assign({ listing_id: listingId }, row)));
    },
    async deleteDocument(doc) {
      if (this.isDemo) {
        window.DEMO_LISTINGS.forEach((l) => { if (l.documents) l.documents = l.documents.filter((d) => d.id !== doc.id); });
        return;
      }
      await wrap(sb.from('documents').delete().eq('id', doc.id));
    },
    async listNdas() {
      if (this.isDemo) return [];
      return wrap(sb.from('ndas').select('*').order('signed_at', { ascending: false }));
    },

    // ===================== ADMIN: LEADS =================================
    async listLeads() {
      if (this.isDemo) return demoState.leads.map((l) => Object.assign({}, l));
      return wrap(sb.from('leads').select('*').order('created_at', { ascending: false }));
    },
    async updateLead(id, patch) {
      if (this.isDemo) {
        const l = demoState.leads.find((x) => x.id === id);
        if (l) Object.assign(l, patch); return l;
      }
      return wrap(sb.from('leads').update(patch).eq('id', id).select().single());
    },
    async createLead(row) {
      if (this.isDemo) {
        const r = Object.assign({ id: uid(), stage: 'new', source: 'manual', created_at: new Date().toISOString() }, row);
        demoState.leads.unshift(r); return r;
      }
      return wrap(sb.from('leads').insert(Object.assign({ source: 'manual' }, row)).select().single());
    },
  };

  window.BK = BK;
})();
