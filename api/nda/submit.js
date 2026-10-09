// Record a signed NDA. The authoritative server path: it re-checks the Didit
// session is Approved (so the browser gate can't be bypassed), records the NDA
// via the submit_nda RPC, builds a PDF of the signed agreement, and emails it
// to the buyer and the broker via Resend.
//
// Env (Vercel → Settings → Environment Variables):
//   DIDIT_API_KEY, DIDIT_WORKFLOW_ID   - Didit (see api/didit/session.js)
//   RESEND_API_KEY                     - Resend key (same account as the DB emails)
//   SUPABASE_URL, SUPABASE_ANON_KEY    - optional; fall back to the public values

const { fetchStatus } = require('../didit/status.js');
const AGREEMENT = require('./_agreement.js');
const { buildPdf, sendEmail, pdfFilename } = require('./_pdf.js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zufqnaxouwlfjpainvsi.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RI7yqJDNJ1XwXMNhcsO6Ww_IbQMbo-r';
// Broker copies of every signed NDA. Override with NDA_BROKER_EMAIL (comma-separated).
const BROKER_RECIPIENTS = (process.env.NDA_BROKER_EMAIL || 'nguedwardlee@gmail.com')
  .split(',').map((s) => s.trim()).filter(Boolean);

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}

async function rpcSubmit(payload) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_nda`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data && (data.message || data.error)) || 'Could not record the NDA.');
  return data;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const b = readBody(req);
  const { listing_id, name, email, phone, signature, signature_type, session_id } = b;
  if (!listing_id || !name || !email || !signature) return res.status(400).json({ error: 'Missing required fields.' });

  // 1) Re-verify identity server-side — the gate must not be client-trustable.
  let diditStatus = null;
  if (process.env.DIDIT_API_KEY) {
    if (!session_id) return res.status(400).json({ error: 'Missing verification session.' });
    try {
      const s = await fetchStatus(session_id);
      diditStatus = s.status;
      if (!s.ok || s.status !== 'Approved') {
        return res.status(403).json({ error: 'Identity verification is not approved yet.' });
      }
    } catch { return res.status(502).json({ error: 'Could not confirm verification.' }); }
  }

  // 2) Record it.
  let rec;
  try {
    rec = await rpcSubmit({
      p_listing_id: listing_id, p_name: name, p_email: email, p_phone: phone || null,
      p_signature: signature, p_signature_type: signature_type || 'typed',
      p_didit_session_id: session_id || null, p_didit_status: diditStatus,
      p_agreement_version: AGREEMENT.VERSION,
    });
  } catch (e) { return res.status(500).json({ error: e.message }); }

  const business = (rec && rec.business) || 'the business';
  const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // 3) PDF + emails (best-effort; a mail failure doesn't undo the record).
  // PDF is decoupled: if it fails to build, we still send the emails without it.
  let pdfBuf = null;
  try {
    pdfBuf = await buildPdf({
      business, name, email, signature, signatureType: signature_type,
      didit: diditStatus ? { status: diditStatus, session_id } : null, dateStr,
    });
  } catch (e) { console.error('PDF build failed', String(e && e.message)); }

  const filename = pdfFilename(business);
  const buyerHtml = `<p>Hi ${name},</p><p>Thank you for signing the confidentiality agreement for <strong>${business}</strong>.${pdfBuf ? ' A copy is attached for your records.' : ''} A member of our team will follow up with the confidential information shortly.</p><p>— NGU Business Real Estate</p>`;
  const brokerHtml = `<p>New NDA signed.</p><ul><li><strong>Business:</strong> ${business}</li><li><strong>Name:</strong> ${name}</li><li><strong>Email:</strong> ${email}</li><li><strong>Phone:</strong> ${phone || '—'}</li><li><strong>Identity:</strong> ${diditStatus || 'n/a'}</li></ul><p><a href="https://www.ngubiz.com/admin.html">Open the admin</a></p>`;

  let emailed = false, emailError = null;
  try {
    const r1 = await sendEmail(email, `Your signed NDA — ${business}`, buyerHtml, pdfBuf, filename);
    const r2 = await sendEmail(BROKER_RECIPIENTS, `NDA signed: ${business} — ${name}`, brokerHtml, pdfBuf, filename);
    emailed = !!(r1.ok && r2.ok);
    if (!emailed) emailError = (r1.skipped || r2.skipped) ? 'RESEND_API_KEY not set' : ((r1.body && r1.body.message) || (r2.body && r2.body.message) || 'send failed');
  } catch (e) { emailError = String(e && e.message); console.error('Email send threw', emailError); }

  return res.status(200).json({ ok: true, nda_id: rec && rec.nda_id, business, emailed, emailError });
};
