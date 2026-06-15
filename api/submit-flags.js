export default async function handler(req, res) {
  const allowedOrigin = '*';

  const setCors = () => {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  };

  setCors();

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { flaggedUrls, action, digestDate } = req.body || {};

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return res.status(500).json({ error: 'Missing GITHUB_TOKEN in environment variables' });
    }

    const owner = 'iirslibrary';
    const repo = 'Space-News';
    const branch = 'main';
    const workflowId = 'daily-digest.yml';

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    async function getFileShaAndContent(path) {
      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
        { headers }
      );

      if (resp.status === 404) {
        return { sha: null, content: null };
      }

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Failed to fetch ${path}: ${resp.status} ${txt}`);
      }

      const data = await resp.json();
      const decoded = Buffer.from(data.content, 'base64').toString('utf-8');
      return { sha: data.sha, content: decoded };
    }

    async function putFile(path, objectOrArray, message) {
      const { sha } = await getFileShaAndContent(path);
      const content = Buffer.from(JSON.stringify(objectOrArray, null, 2)).toString('base64');

      const body = {
        message,
        content,
        branch
      };

      if (sha) body.sha = sha;

      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(body)
        }
      );

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Failed to update ${path}: ${resp.status} ${txt}`);
      }

      return resp.json();
    }

    async function dispatchWorkflow() {
      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ref: branch })
        }
      );

      if (!(resp.status === 204 || resp.ok)) {
        const txt = await resp.text();
        throw new Error(`Workflow dispatch failed: ${resp.status} ${txt}`);
      }
    }

    if (action === 'publish') {
      if (!digestDate || typeof digestDate !== 'string') {
        return res.status(400).json({
          error: 'digestDate is required for publish action'
        });
      }

      await putFile(
        'published_digest_state.json',
        { published_for_date: digestDate },
        `Mark digest as published for ${digestDate}`
      );

      await dispatchWorkflow();

      return res.status(200).json({
        success: true,
        message: `Digest marked as published for ${digestDate} and workflow triggered`
      });
    }

    if (!Array.isArray(flaggedUrls) || flaggedUrls.length === 0) {
      return res.status(400).json({ error: 'No flagged URLs received' });
    }

    const { content } = await getFileShaAndContent('flagged_urls.json');

    let existing = [];
    if (content) {
      try {
        existing = JSON.parse(content);
      } catch {
        existing = [];
      }
    }

    const merged = [
      ...new Set([
        ...(Array.isArray(existing) ? existing : []),
        ...flaggedUrls.filter(url => typeof url === 'string' && url.trim())
      ])
    ];

    await putFile(
      'flagged_urls.json',
      merged,
      'Update flagged URLs from review page'
    );

    await dispatchWorkflow();

    return res.status(200).json({
      success: true,
      message: 'Flagged URLs saved and workflow triggered',
      count: merged.length
    });

  } catch (error) {
    setCors();
    return res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  }
}
