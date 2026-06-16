import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';

const googleClient = new OAuth2Client();

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const idx = part.indexOf('=');
        return [part.slice(0, idx), part.slice(idx + 1)];
      })
  );
}

function signSession(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

function verifySession(token, secret) {
  if (!token) return null;

  const [data, sig] = token.split('.');
  if (!data || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');

  if (sig !== expectedSig) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8')
    );

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function buildSessionCookie(value, maxAgeSeconds = 60 * 60 * 24 * 7) {
  return [
    `space_news_session=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ].join('; ');
}

export default async function handler(req, res) {
  const allowedOrigin = '*';

  const setCors = () => {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  };

  setCors();

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { flaggedUrls, action } = req.body || {};

    const githubToken = process.env.GITHUB_TOKEN;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const sessionSecret = process.env.SESSION_SECRET;
    const allowedReviewerEmailsRaw = process.env.ALLOWED_REVIEWER_EMAILS || '';

    if (!githubToken) {
      return res.status(500).json({
        error: 'Missing GITHUB_TOKEN in environment variables'
      });
    }

    if (!googleClientId) {
      return res.status(500).json({
        error: 'Missing GOOGLE_CLIENT_ID in environment variables'
      });
    }

    if (!sessionSecret) {
      return res.status(500).json({
        error: 'Missing SESSION_SECRET in environment variables'
      });
    }

    const allowedReviewerEmails = allowedReviewerEmailsRaw
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);

    if (allowedReviewerEmails.length === 0) {
      return res.status(500).json({
        error: 'Missing ALLOWED_REVIEWER_EMAILS in environment variables'
      });
    }

    let reviewerEmail = null;
    let sessionUser = null;
    let newSessionCookie = null;

    const cookies = parseCookies(req.headers.cookie || '');
    const existingSession = verifySession(cookies.space_news_session, sessionSecret);

    if (
      existingSession &&
      existingSession.email &&
      allowedReviewerEmails.includes(String(existingSession.email).toLowerCase().trim())
    ) {
      reviewerEmail = String(existingSession.email).toLowerCase().trim();
      sessionUser = existingSession;
    } else {
      const authHeader = req.headers.authorization || '';

      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          error: 'Missing or invalid Authorization header'
        });
      }

      const idToken = authHeader.slice('Bearer '.length).trim();

      if (!idToken) {
        return res.status(401).json({
          error: 'Missing Google ID token'
        });
      }

      try {
        const ticket = await googleClient.verifyIdToken({
          idToken,
          audience: googleClientId
        });

        const payload = ticket.getPayload();

        if (!payload) {
          return res.status(401).json({
            error: 'Invalid Google token payload'
          });
        }

        if (!payload.email || !payload.email_verified) {
          return res.status(403).json({
            error: 'Google account email is missing or not verified'
          });
        }

        reviewerEmail = String(payload.email).toLowerCase().trim();

        if (!allowedReviewerEmails.includes(reviewerEmail)) {
          return res.status(403).json({
            error: `Unauthorized reviewer: ${reviewerEmail}`
          });
        }

        sessionUser = {
          sub: payload.sub,
          email: reviewerEmail,
          name: payload.name || '',
          picture: payload.picture || '',
          exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
        };

        const signedSession = signSession(sessionUser, sessionSecret);
        newSessionCookie = buildSessionCookie(signedSession);
      } catch (authError) {
        return res.status(401).json({
          error: 'Google token verification failed',
          details: authError.message
        });
      }
    }

    const owner = 'iirslibrary';
    const repo = 'Space-News';
    const branch = 'main';
    const workflowId = 'daily-digest.yml';

    const githubHeaders = {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    async function getFileShaAndContent(path) {
      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
        { headers: githubHeaders }
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
      const content = Buffer.from(
        JSON.stringify(objectOrArray, null, 2)
      ).toString('base64');

      const body = {
        message,
        content,
        branch
      };

      if (sha) {
        body.sha = sha;
      }

      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          method: 'PUT',
          headers: githubHeaders,
          body: JSON.stringify(body)
        }
      );

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Failed to update ${path}: ${resp.status} ${txt}`);
      }

      return resp.json();
    }

    async function dispatchWorkflow(runMode) {
      const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
        {
          method: 'POST',
          headers: githubHeaders,
          body: JSON.stringify({
            ref: branch,
            inputs: {
              run_mode: runMode
            }
          })
        }
      );

      if (!(resp.status === 204 || resp.ok)) {
        const txt = await resp.text();
        throw new Error(`Workflow dispatch failed: ${resp.status} ${txt}`);
      }
    }

    function getIstDate() {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    }

    if (action === 'publish') {
      const istDate = getIstDate();

      if (newSessionCookie) {
        res.setHeader('Set-Cookie', [newSessionCookie]);
      }

      await putFile(
        'published_digest_state.json',
        {
          published_for_date: istDate,
          published_by: reviewerEmail
        },
        `Mark digest as published for ${istDate} by ${reviewerEmail}`
      );

      await dispatchWorkflow('publish');

      return res.status(200).json({
        success: true,
        message: `Digest marked as published for ${istDate} and workflow triggered`,
        reviewer: reviewerEmail,
        user: sessionUser
      });
    }

    if (!Array.isArray(flaggedUrls) || flaggedUrls.length === 0) {
      return res.status(400).json({ error: 'No flagged URLs received' });
    }

    const cleanedFlaggedUrls = flaggedUrls
      .filter(url => typeof url === 'string')
      .map(url => url.trim())
      .filter(Boolean);

    if (cleanedFlaggedUrls.length === 0) {
      return res.status(400).json({ error: 'No valid flagged URLs received' });
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
        ...cleanedFlaggedUrls
      ])
    ];

    if (newSessionCookie) {
      res.setHeader('Set-Cookie', [newSessionCookie]);
    }

    await putFile(
      'flagged_urls.json',
      merged,
      `Update flagged URLs from review page by ${reviewerEmail}`
    );

    await dispatchWorkflow('flag_review');

    return res.status(200).json({
      success: true,
      message: 'Flagged URLs saved and workflow triggered',
      count: merged.length,
      reviewer: reviewerEmail,
      user: sessionUser
    });

  } catch (error) {
    setCors();
    return res.status(500).json({
      error: 'Server error',
      details: error.message
    });
  }
}
