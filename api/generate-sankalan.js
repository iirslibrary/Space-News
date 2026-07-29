export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { fromDate, toDate } = req.body;
    if (!fromDate || !toDate) return res.status(400).json({ error: 'Missing dates' });

    try {
        const githubToken = process.env.GITHUB_PAT; 
        const repoOwner = 'YOUR_GITHUB_USERNAME';   
        const repoName = 'YOUR_REPO_NAME';          
        const workflowId = 'sankalan.yml'; // Targets your new isolated workflow

        const githubRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/actions/workflows/${workflowId}/dispatches`, {
            method: 'POST',
            headers: {
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${githubToken}`,
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ref: 'main', inputs: { from_date: fromDate, to_date: toDate } })
        });

        if (!githubRes.ok) throw new Error(await githubRes.text());
        return res.status(200).json({ success: true });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
