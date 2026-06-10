// Proxy: strona -> MailerLite. Trzyma klucz API poza publicznym JS.
const GROUP_ID = '189925136723347234'; // "Longevity Score — SSWB"
const ALLOWED_FIELDS = ['ls_score', 'ls_verdict', 'ls_vo2', 'ls_bmi', 'ls_rec', 'ls_goal', 'ls_issue', 'ls_age', 'ls_sex'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, name, fields } = req.body ?? {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const safeFields = { name: typeof name === 'string' ? name.slice(0, 100) : '' };
  for (const key of ALLOWED_FIELDS) {
    if (fields?.[key] !== undefined) safeFields[key] = String(fields[key]).slice(0, 100);
  }

  const upstream = await fetch('https://connect.mailerlite.com/api/subscribers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
    },
    body: JSON.stringify({ email, fields: safeFields, groups: [GROUP_ID] }),
  });

  if (!upstream.ok) {
    console.error('MailerLite error', upstream.status, await upstream.text());
    return res.status(502).json({ error: 'Subscription failed' });
  }
  return res.status(200).json({ ok: true });
}
