// Create a Didit identity-verification session (server-side; holds the secret
// API key). The browser calls this, gets back a hosted verification URL, and
// embeds it. See https://docs.didit.me/integration/api-full-flow
//
// Env (set in Vercel → Project → Settings → Environment Variables):
//   DIDIT_API_KEY      - secret API key from the Didit Console (never in the repo)
//   DIDIT_WORKFLOW_ID  - the workflow UUID to run
//   DIDIT_CALLBACK     - optional; where Didit returns the user (default /nda)

const DIDIT_BASE = 'https://verification.didit.me';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const apiKey = process.env.DIDIT_API_KEY;
  const workflowId = process.env.DIDIT_WORKFLOW_ID;
  if (!apiKey || !workflowId) {
    return res.status(500).json({ error: 'Verification is not configured yet.' });
  }

  // Our own reference for this attempt, echoed back in the decision/webhook.
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const ref = (body && body.ref ? String(body.ref) : '').slice(0, 120) || ('nda-' + Date.now());
  const origin = `https://${req.headers.host}`;
  const callback = process.env.DIDIT_CALLBACK || `${origin}/nda`;

  try {
    const r = await fetch(`${DIDIT_BASE}/v3/session/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ workflow_id: workflowId, vendor_data: ref, callback }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(502).json({ error: 'Could not start verification.', detail: data });
    }
    // Only hand the browser what it needs to run the hosted flow.
    return res.status(200).json({ session_id: data.session_id, url: data.url });
  } catch (e) {
    return res.status(502).json({ error: 'Verification service unreachable.' });
  }
};
