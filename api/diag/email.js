// TEMPORARY diagnostic — reports which env vars are present and (with ?run=1)
// attempts a Resend send to the broker address, returning Resend's raw reply.
// Remove this file once email is confirmed working.

const BROKER_EMAIL = process.env.NDA_BROKER_EMAIL || 'nguedwardlee@gmail.com';
const MAIL_FROM = 'NGU Business Real Estate <notifications@ngubiz.com>';

module.exports = async (req, res) => {
  const present = {
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    DIDIT_API_KEY: !!process.env.DIDIT_API_KEY,
    DIDIT_WORKFLOW_ID: !!process.env.DIDIT_WORKFLOW_ID,
  };
  if (!(req.query && req.query.run)) {
    return res.status(200).json({ present, hint: 'add ?run=1 to attempt a test send to the broker' });
  }
  if (!process.env.RESEND_API_KEY) {
    return res.status(200).json({ present, sent: false, reason: 'RESEND_API_KEY not set' });
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: MAIL_FROM, to: [BROKER_EMAIL], subject: 'NGU NDA email diagnostic', html: '<p>Test email from the /nda pipeline diagnostic.</p>' }),
    });
    const body = await r.json().catch(() => ({}));
    return res.status(200).json({ present, sent: r.ok, resendStatus: r.status, resend: body });
  } catch (e) {
    return res.status(200).json({ present, sent: false, error: String(e && e.message) });
  }
};
