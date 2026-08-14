export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://iirslibrary.github.io');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { fromDate, toDate } = req.body || {};
        if (!fromDate || !toDate) {
            return res.status(400).json({ error: 'Missing fromDate or toDate' });
        }

        // Trigger GitHub Workflow directly without authentication validation
        const githubRes = await fetch('https://api.github.com/repos/iirslibrary/Space-News/actions/workflows/sankalan.yml/dispatches', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28'
            },
            body: JSON.stringify({
                ref: 'main',
                inputs: {
                    from_date: fromDate,
                    to_date: toDate
                }
            })
        });

        if (!githubRes.ok) {
            throw new Error(await githubRes.text());
        }

        return res.status(200).json({ success: true, message: 'Workflow triggered successfully' });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
