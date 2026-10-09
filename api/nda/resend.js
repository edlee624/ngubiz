// Resend a signed NDA's PDF to the email that signed it. Authorized by the
// caller's own Supabase session token: the row is read under that token, so
// RLS (staff-only on ndas) decides access, and the PDF only ever goes to the
// signer_email stored on the record (not a client-supplied address).

const AGREEMENT = require('./_agreement.js');
const { buildPdf, sendEmail, pdfFilename } = require('./_pdf.js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zufqnaxouwlfjpainvsi.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RI7yqJDNJ1XwXMNhcsO6Ww_IbQMbo-r';

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const { id, token } = readBody(req);
  if (!id || !token) return res.status(400).json({ error: 'Missing id or token.' });

  // Read the row as the caller — RLS (staff-only) gates this.
  let row;
  try {
    const q = `${SUPABASE_URL}/rest/v1/ndas?id=eq.${encodeURIComponent(id)}&select=*,listing:listings(title,ref_code)`;
    const r = await fetch(q, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } });
    const rows = await r.json().catch(() => []);
    if (!r.ok || !Array.isArray(rows) || !rows.length) {
      return res.status(403).json({ error: 'Not authorized or NDA not found.' });
    }
    row = rows[0];
  } catch (e) { return res.status(502).json({ error: 'Could not read the NDA.' }); }

  if (!row.signer_email) return res.status(400).json({ error: 'This NDA has no signer email on file.' });

  const business = row.listing
    ? `${row.listing.ref_code ? row.listing.ref_code + ' — ' : ''}${row.listing.title}`
    : 'the business';
  const dateStr = new Date(row.signed_at || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  let pdfBuf = null;
  try {
    pdfBuf = await buildPdf({
      business, name: row.signer_name, signature: row.signature, signatureType: row.signature_type,
      didit: row.didit_status ? { status: row.didit_status, session_id: row.didit_session_id } : null, dateStr,
    });
  } catch (e) { console.error('PDF build failed', String(e && e.message)); }

  const html = `<p>Hi ${row.signer_name || 'there'},</p><p>As requested, here is your signed confidentiality agreement for <strong>${business}</strong>${pdfBuf ? ', attached' : ''}.</p><p>— NGU Business Real Estate</p>`;
  const r = await sendEmail(row.signer_email, `Your signed NDA — ${business}`, html, pdfBuf, pdfFilename(business));

  if (!r.ok) return res.status(502).json({ error: r.skipped ? 'Email is not configured.' : 'Email failed to send.' });
  return res.status(200).json({ ok: true, to: row.signer_email });
};
