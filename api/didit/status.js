// Read a Didit session's decision status (server-side; holds the secret key).
// Returns only the status string to the browser — never the PII decision.
// GET /api/didit/status?session_id=...

const DIDIT_BASE = 'https://verification.didit.me';

async function fetchStatus(sessionId) {
  const apiKey = process.env.DIDIT_API_KEY;
  const r = await fetch(`${DIDIT_BASE}/v3/session/${encodeURIComponent(sessionId)}/decision/`, {
    headers: { 'x-api-key': apiKey },
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: data && data.status };
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.DIDIT_API_KEY) {
    return res.status(500).json({ error: 'Verification is not configured yet.' });
  }
  const sessionId = (req.query && req.query.session_id) || '';
  if (!sessionId) return res.status(400).json({ error: 'Missing session_id' });

  try {
    const { ok, status } = await fetchStatus(sessionId);
    if (!ok) return res.status(404).json({ error: 'Session not found' });
    return res.status(200).json({ status: status || 'Unknown' });
  } catch (e) {
    return res.status(502).json({ error: 'Verification service unreachable.' });
  }
};

module.exports.fetchStatus = fetchStatus;
