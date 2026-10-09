// Shared: build the signed-NDA PDF and send mail via Resend. Used by
// api/nda/submit.js (on signing) and api/nda/resend.js (manual resend).
// Underscore-prefixed so Vercel treats it as a support file, not an endpoint.

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const AGREEMENT = require('./_agreement.js');

const MAIL_FROM = 'NGU Business Real Estate <notifications@ngubiz.com>';

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

async function buildPdf({ business, name, signature, signatureType, didit, dateStr }) {
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

async function sendEmail(to, subject, html, pdfBuf, filename) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, skipped: true };
  const payload = { from: MAIL_FROM, to: Array.isArray(to) ? to : [to], subject, html };
  if (pdfBuf) payload.attachments = [{ filename, content: pdfBuf.toString('base64') }];
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(payload),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) console.error('Resend error', r.status, body);
  return { ok: r.ok, status: r.status, body };
}

function pdfFilename(business) {
  return `NDA-${business}`.replace(/[^a-z0-9]+/gi, '-').slice(0, 60) + '.pdf';
}

module.exports = { buildPdf, sendEmail, pdfFilename, MAIL_FROM };
