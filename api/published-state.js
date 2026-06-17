export default async function handler(req, res) {
  const allowedOrigin = '*';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const githubToken = process.env.GITHUB_TOKEN;

    if (!githubToken) {
      return res.status(500).json({ error: 'Missing GITHUB_TOKEN in environment variables' });
    }

    const owner = 'iirslibrary';
    const repo = 'Space-News';
    const branch = 'main';

    const resp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/published_digest_state.json?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28'
        }
      }
    );

    if (resp.status === 404) {
      return res.status(200).json({
        published: false,
        published_for_date: null,
        published_by: null
      });
    }

    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Failed to fetch published state: ${resp.status} ${txt}`);
    }

    const data = await resp.json();
    const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
    const state = JSON.parse(decoded);

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());

    const publishedForToday = state.published_for_date === today;

    return res.status(200).json({
      published: publishedForToday,
      published_for_date: state.published_for_date || null,
      published_by: state.published_by || null
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  }
}
