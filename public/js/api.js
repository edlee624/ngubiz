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

  // `broker` is the PRIMARY agent (owns enquiries); `agents` is everyone the
  // listing is assigned to, primary first.
  //
  // The !listings_broker_id_fkey hint is required: once listing_brokers exists
  // there are two paths from listings to brokers (the direct broker_id column
  // and the join table), and PostgREST refuses an ambiguous embed (PGRST201).
  const LISTING_SELECT =
    '*, listing_images(*), broker:brokers!listings_broker_id_fkey(*), listing_brokers(broker:brokers(*))';

  function normalizeAgents(rows) {
    (rows || []).forEach((l) => {
      const joined = (l.listing_brokers || []).map((j) => j.broker).filter(Boolean);
      // Primary first, then the rest, de-duplicated.
      const seen = new Set();
      l.agents = [l.broker, ...joined].filter((b) => {
        if (!b || seen.has(b.id)) return false;
        seen.add(b.id); return true;
      });
      delete l.listing_brokers;
    });
    return rows;
  }

  // ---- DEMO helpers -------------------------------------------------------
  function demoBrokers() { return (window.DEMO_BROKERS || []).map((b) => Object.assign({}, b)); }
  // Mirror the `broker:brokers(*)` join Supabase returns, so render code is identical.
  function attachBroker(l) {
    const all = window.DEMO_BROKERS || [];
    l.broker = all.find((b) => b.id === l.broker_id) || null;
    // Mirror the live shape: assigned agents, primary first.
    const ids = l.broker_ids && l.broker_ids.length ? l.broker_ids : (l.broker_id ? [l.broker_id] : []);
    const seen = new Set();
    l.agents = [l.broker_id, ...ids]
      .filter((id) => id && !seen.has(id) && seen.add(id))
      .map((id) => all.find((b) => b.id === id))
      .filter(Boolean);
    return l;
  }
  function demoAll() { return (window.DEMO_LISTINGS || []).map((l) => attachBroker(Object.assign({}, l))); }
  function demoLive() { return demoAll().filter((l) => LIVE_STATUSES.indexOf(l.status) !== -1); }

  // Simulated auth + lead store for demo admin.
  const demoState = { signedIn: false, leads: seedDemoLeads() };
  function seedDemoLeads() {
    return [
      { id: 'l1', type: 'buyer', stage: 'qualified', name: 'Jordan Ellis', email: 'jordan@example.com', phone: '(555) 200-1010', listing_id: 'demo-1', message: 'Interested in the salon — have funds ready.', budget: '$300k–$450k', timeframe: '60 days', source: 'website', created_at: '2026-06-28T15:00:00Z' },
      { id: 'l2', type: 'seller', stage: 'new', name: 'Pat Morgan', email: 'pat@example.com', phone: '(555) 200-2020', listing_id: null, message: 'I own a landscaping company and may want to sell next year.', budget: '', timeframe: '6–12 months', source: 'website', created_at: '2026-07-01T18:30:00Z' },
      { id: 'l3', type: 'inquiry', stage: 'contacted', name: 'Sam Rivera', email: 'sam@example.com', phone: '', listing_id: 'demo-3', message: 'Is seller financing negotiable on the HVAC business?', budget: '', timeframe: '', source: 'website', created_at: '2026-07-03T12:10:00Z' },
      { id: 'l4', type: 'buyer', stage: 'nda_signed', name: 'Alex Chen', email: 'alex@example.com', phone: '(555) 200-4040', listing_id: 'demo-2', message: 'NDA signed offline; sent the CIM by email.', budget: '', timeframe: '', source: 'website', created_at: '2026-07-04T09:45:00Z' },
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
          .select(LISTING_SELECT)
          .in('status', LIVE_STATUSES)
          .order('is_featured', { ascending: false })
          .order('updated_at', { ascending: false })
      ).then(normalizeAgents);
    },
    async getListingBySlug(slug) {
      if (this.isDemo) return demoLive().find((l) => l.slug === slug) || null;
      const rows = await wrap(sb.from('listings').select(LISTING_SELECT).eq('slug', slug).limit(1));
      return rows && rows[0] ? normalizeAgents(rows)[0] : null;
    },

    // ===================== FILE UPLOADS ==================================
    // Uploads to the public `media` bucket (see migration 0004) and returns the
    // public URL. In demo mode there's no backend, so hand back a data: URL so
    // the picker still previews.
    async uploadImage(file, folder) {
      if (!file) throw new Error('No file selected');
      if (!/^image\//.test(file.type)) throw new Error('That file is not an image');
      if (file.size > 8 * 1024 * 1024) throw new Error('Image is larger than 8 MB');

      if (this.isDemo) {
        return await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = () => rej(new Error('Could not read the file'));
          fr.readAsDataURL(file);
        });
      }
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${folder || 'uploads'}/${uid()}-${Math.floor(performance.now())}.${ext}`;
      const { error } = await sb.storage.from('media').upload(path, file, {
        cacheControl: '31536000', upsert: false, contentType: file.type,
      });
      if (error) {
        if (/bucket/i.test(error.message)) {
          throw new Error('Storage bucket "media" is missing — run supabase/migrations/0004_storage.sql');
        }
        throw new Error(error.message);
      }
      return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
    },

    // Remove a previously uploaded file. Ignores images that live outside the
    // bucket (e.g. the repo's /img/... files), which have nothing to delete.
    async deleteUpload(url) {
      if (this.isDemo || !url) return;
      const marker = '/storage/v1/object/public/media/';
      const i = String(url).indexOf(marker);
      if (i === -1) return;
      const path = decodeURIComponent(String(url).slice(i + marker.length));
      await sb.storage.from('media').remove([path]);
    },

    // ===================== BROKERS =======================================
    async listBrokers() {
      if (this.isDemo) return demoBrokers().filter((b) => b.is_active).sort((a, c) => a.sort_order - c.sort_order);
      return wrap(sb.from('brokers').select('*').eq('is_active', true).order('sort_order'));
    },
    async getBrokerBySlug(slug) {
      if (this.isDemo) return demoBrokers().find((b) => b.slug === slug && b.is_active) || null;
      const rows = await wrap(sb.from('brokers').select('*').eq('slug', slug).limit(1));
      return rows && rows[0] ? rows[0] : null;
    },
    // Every listing this agent is assigned to — not just the ones they own.
    async listListingsByBroker(brokerId) {
      if (this.isDemo) return demoLive().filter((l) => (l.agents || []).some((a) => a.id === brokerId));
      const joins = await wrap(sb.from('listing_brokers').select('listing_id').eq('broker_id', brokerId));
      const ids = (joins || []).map((j) => j.listing_id);
      if (!ids.length) return [];
      return wrap(
        sb.from('listings').select(LISTING_SELECT)
          .in('id', ids).in('status', LIVE_STATUSES)
          .order('is_featured', { ascending: false })
      ).then(normalizeAgents);
    },
    async adminListBrokers() {
      if (this.isDemo) return demoBrokers().sort((a, c) => a.sort_order - c.sort_order);
      return wrap(sb.from('brokers').select('*').order('sort_order'));
    },
    async saveBroker(row) {
      if (this.isDemo) {
        const all = window.DEMO_BROKERS;
        if (row.id) {
          const i = all.findIndex((x) => x.id === row.id);
          if (i !== -1) all[i] = Object.assign(all[i], row);
        } else { row.id = uid(); all.push(row); }
        return row;
      }
      if (row.id) return wrap(sb.from('brokers').update(row).eq('id', row.id).select().single());
      return wrap(sb.from('brokers').insert(row).select().single());
    },
    async deleteBroker(id) {
      if (this.isDemo) {
        const all = window.DEMO_BROKERS; const i = all.findIndex((x) => x.id === id);
        if (i !== -1) all.splice(i, 1); return;
      }
      await wrap(sb.from('brokers').delete().eq('id', id));
    },

    // ===================== PUBLIC WRITES (RPCs) ==========================
    async submitInquiry(p) {
      if (this.isDemo) {
        // Mirror the RPC: an explicit broker wins, else inherit from the listing.
        let broker = p.broker_id || null;
        if (!broker && p.listing_id) {
          const l = (window.DEMO_LISTINGS || []).find((x) => x.id === p.listing_id);
          broker = (l && l.broker_id) || null;
        }
        demoState.leads.unshift({
          id: uid(), type: p.type || 'inquiry', stage: 'new', name: p.name, email: p.email,
          phone: p.phone || '', listing_id: p.listing_id || null, broker_id: broker,
          message: p.message || '', source: 'website', created_at: new Date().toISOString(),
        });
        return;
      }
      await wrap(sb.rpc('submit_inquiry', {
        p_name: p.name, p_email: p.email, p_message: p.message || '',
        p_phone: p.phone || null, p_listing_id: p.listing_id || null, p_type: p.type || 'inquiry',
        p_broker_id: p.broker_id || null,
      }));
    },
    // ===================== ADMIN: LISTINGS ===============================
    async adminListListings() {
      if (this.isDemo) return demoAll();
      return wrap(sb.from('listings').select(LISTING_SELECT).order('updated_at', { ascending: false }))
        .then(normalizeAgents);
    },

    // Replace a listing's assigned agents. brokerIds[0] becomes the primary
    // (the agent who receives enquiries for it).
    async setListingAgents(listingId, brokerIds) {
      const ids = [...new Set((brokerIds || []).filter(Boolean))];
      if (this.isDemo) {
        const l = window.DEMO_LISTINGS.find((x) => x.id === listingId);
        if (l) { l.broker_ids = ids; l.broker_id = ids[0] || null; }
        return;
      }
      // Primary first so the sync trigger can't re-add a broker we just removed.
      await wrap(sb.from('listings').update({ broker_id: ids[0] || null }).eq('id', listingId).select());
      await wrap(sb.from('listing_brokers').delete().eq('listing_id', listingId).not('broker_id', 'in', `(${ids.join(',') || '00000000-0000-0000-0000-000000000000'})`));
      if (ids.length) {
        await wrap(sb.from('listing_brokers')
          .upsert(ids.map((broker_id) => ({ listing_id: listingId, broker_id })), { onConflict: 'listing_id,broker_id' }));
      }
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
      // Strip joined/child relations — these aren't columns on `listings`.
      delete payload.listing_images; delete payload.documents; delete payload.broker;
      delete payload.agents; delete payload.listing_brokers; delete payload.broker_ids;
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
        // Give demo images an id too, so deleting one can identify it.
        if (l) { l.listing_images = l.listing_images || []; l.listing_images.push({ id: uid(), url, caption, sort_order: l.listing_images.length }); }
        return;
      }
      await wrap(sb.from('listing_images').insert({ listing_id: listingId, url, caption: caption || null }));
    },
    async deleteImage(img) {
      if (this.isDemo) {
        window.DEMO_LISTINGS.forEach((l) => {
          if (!l.listing_images) return;
          // Match on identity, or on id when BOTH have one. Comparing ids
          // blindly matched undefined === undefined and deleted every image.
          l.listing_images = l.listing_images.filter((im) =>
            !(im === img || (im.id && img.id && im.id === img.id)));
        });
        return;
      }
      if (!img || !img.id) throw new Error('Cannot delete: image has no id');
      await wrap(sb.from('listing_images').delete().eq('id', img.id));
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
    async deleteLead(id) {
      if (this.isDemo) {
        const i = demoState.leads.findIndex((x) => x.id === id);
        if (i !== -1) demoState.leads.splice(i, 1); return;
      }
      await wrap(sb.from('leads').delete().eq('id', id));
    },
  };

  window.BK = BK;
})();
