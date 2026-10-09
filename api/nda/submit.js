// Record a signed NDA. The authoritative server path: it re-checks the Didit
// session is Approved (so the browser gate can't be bypassed), records the NDA
// via the submit_nda RPC, builds a PDF of the signed agreement, and emails it
// to the buyer and the broker via Resend.
//
// Env (Vercel → Settings → Environment Variables):
//   DIDIT_API_KEY, DIDIT_WORKFLOW_ID   - Didit (see api/didit/session.js)
//   RESEND_API_KEY                     - Resend key (same account as the DB emails)
//   SUPABASE_URL, SUPABASE_ANON_KEY    - optional; fall back to the public values

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { fetchStatus } = require('../didit/status.js');
const AGREEMENT = require('./_agreement.js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zufqnaxouwlfjpainvsi.supabase.co';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || 'sb_publishable_RI7yqJDNJ1XwXMNhcsO6Ww_IbQMbo-r';
const BROKER_EMAIL = process.env.NDA_BROKER_EMAIL || 'nguedwardlee@gmail.com';
const MAIL_FROM = 'NGU Business Real Estate <notifications@ngubiz.com>';

function readBody(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
  return b || {};
}

// Wrap text to a width in points for a given font/size.
function wrapLines(text, font, size, maxWidth) {
  const out = [];
  String(text).split('\n').forEach((para) => {
    let line = '';
    para.split(/\s+/).forEach((word) => {
      const next = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && line) { out.push(line); line = word; }
      else line = next;
    });
    out.push(line);
  });
  return out;
}

async function buildPdf({ business, name, email, signature, signatureType, didit, dateStr }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const size = 9, lh = 12, margin = 54, pageW = 612, pageH = 792, maxW = pageW - margin * 2;
  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;

  const ensure = (need) => { if (y - need < margin) { page = pdf.addPage([pageW, pageH]); y = pageH - margin; } };
  const write = (text, f, s, gap) => {
    wrapLines(text, f, s, maxW).forEach((ln) => { ensure(lh); page.drawText(ln, { x: margin, y, size: s, font: f, color: rgb(0, 0, 0) }); y -= lh; });
    if (gap) y -= gap;
  };

  write(AGREEMENT.TITLE, bold, 11, 8);
  write(AGREEMENT.intro(business), font, size, 8);
  AGREEMENT.SECTIONS.forEach((sec) => { write(sec.n + '. ' + sec.heading + ':', bold, size, 2); write(sec.body, font, size, 8); });

  ensure(90);
  y -= 8;
  write('Business: ' + business, bold, size, 2);
  write('Name: ' + name + '    Date: ' + dateStr, font, size, 6);

  // Signature: embedded image if drawn, otherwise the typed name in script-ish bold.
  if (signatureType === 'drawn' && signature && signature.indexOf('data:image') === 0) {
    try {
      const png = await pdf.embedPng(signature);
      const w = 180, h = (png.height / png.width) * w;
      ensure(h + 16);
      page.drawText('Signature:', { x: margin, y, size, font });
      page.drawImage(png, { x: margin + 70, y: y - h + size, width: w, height: h });
      y -= (h + 6);
    } catch { write('Signature: ' + name + ' (electronic)', font, size, 2); }
  } else {
    write('Signature: ' + name + ' (typed / electronic)', font, size, 2);
  }
  if (didit) write('Identity verified via Didit - status ' + didit.status + ' (session ' + didit.session_id + ')', font, 8, 2);

  return Buffer.from(await pdf.save());
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

async function sendEmail(to, subject, html, pdfBuf, filename) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { skipped: true };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      from: MAIL_FROM, to: [to], subject, html,
      attachments: [{ filename, content: pdfBuf.toString('base64') }],
    }),
  });
  return r.json().catch(() => ({}));
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
  let emailed = false;
  try {
    const pdfBuf = await buildPdf({
      business, name, email, signature, signatureType: signature_type,
      didit: diditStatus ? { status: diditStatus, session_id } : null, dateStr,
    });
    const filename = `NDA-${business}`.replace(/[^a-z0-9]+/gi, '-').slice(0, 60) + '.pdf';
    const buyerHtml = `<p>Hi ${name},</p><p>Thank you for signing the confidentiality agreement for <strong>${business}</strong>. A copy is attached for your records. A member of our team will follow up with the confidential information shortly.</p><p>— NGU Business Real Estate</p>`;
    const brokerHtml = `<p>New NDA signed.</p><ul><li><strong>Business:</strong> ${business}</li><li><strong>Name:</strong> ${name}</li><li><strong>Email:</strong> ${email}</li><li><strong>Phone:</strong> ${phone || '—'}</li><li><strong>Identity:</strong> ${diditStatus || 'n/a'}</li></ul><p><a href="https://www.ngubiz.com/admin.html">Open the admin</a></p>`;
    await sendEmail(email, `Your signed NDA — ${business}`, buyerHtml, pdfBuf, filename);
    await sendEmail(BROKER_EMAIL, `NDA signed: ${business} — ${name}`, brokerHtml, pdfBuf, filename);
    emailed = true;
  } catch (e) { /* recorded already; report partial success */ }

  return res.status(200).json({ ok: true, nda_id: rec && rec.nda_id, business, emailed });
};
