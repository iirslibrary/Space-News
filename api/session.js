import crypto from 'crypto';

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

function verifySession(token, secret) {
  if (!token || !secret) return null;

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

export default async function handler(req, res) {
  const allowedOrigins = [
    'https://space-news-sage.vercel.app'
    // Add more frontend origins here if needed
    // 'https://your-other-frontend.vercel.app'
  ];

  const setCors = () => {
    const origin = req.headers.origin;

    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  };

  setCors();

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sessionSecret = process.env.SESSION_SECRET;
    const allowedReviewerEmailsRaw = process.env.ALLOWED_REVIEWER_EMAILS || '';

    if (!sessionSecret) {
      return res.status(500).json({
        error: 'Missing SESSION_SECRET in environment variables'
      });
    }

    const allowedReviewerEmails = allowedReviewerEmailsRaw
      .split(',')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean);

    const cookies = parseCookies(req.headers.cookie || '');
    const session = verifySession(cookies.space_news_session, sessionSecret);

    if (!session || !session.email) {
      return res.status(401).json({
        authenticated: false
      });
    }

    const reviewerEmail = String(session.email).toLowerCase().trim();

    if (
      allowedReviewerEmails.length > 0 &&
      !allowedReviewerEmails.includes(reviewerEmail)
    ) {
      return res.status(403).json({
        authenticated: false,
        error: `Unauthorized reviewer: ${reviewerEmail}`
      });
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        sub: session.sub || '',
        email: reviewerEmail,
        name: session.name || '',
        picture: session.picture || ''
      }
    });
  } catch (error) {
    return res.status(500).json({
      authenticated: false,
      error: 'Server error',
      details: error.message
    });
  }
}
