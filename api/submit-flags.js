export default async function handler(req, res) {
  console.log("Function invoked. Method:", req.method);

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    console.log("Handled OPTIONS request");
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method !== 'POST') {
    console.log("Rejected non-POST request");
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { flaggedUrls, action } = req.body || {};
    console.log("Received body:", req.body);

    const token = process.env.GITHUB_TOKEN;
    console.log("Token present:", !!token);

    const owner = 'iirslibrary';
    const repo = 'Space-News';
    const branch = 'main';

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    if (action === "publish") {
      console.log("Publish action received");

      const finalPath = 'published_digest_state.json';

      const finalContent = Buffer.from(
        JSON.stringify(
          {
            is_finalized: true,
            published_at: new Date().toISOString()
          },
          null,
          2
        )
      ).toString('base64');

      let existingSha = null;

      const getFinalResp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${finalPath}?ref=${branch}`,
        { headers }
      );
      console.log("GET publish state status:", getFinalResp.status);

      if (getFinalResp.ok) {
        const fileData = await getFinalResp.json();
        existingSha = fileData.sha;
      }

      const putFinalResp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${finalPath}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: 'Mark digest as finalized for circulation',
            content: finalContent,
            sha: existingSha,
            branch
          })
        }
      );

      console.log("PUT publish state status:", putFinalResp.status);
      const putFinalText = await putFinalResp.text();
      console.log("PUT publish state response:", putFinalText);

      if (!putFinalResp.ok) {
        return res.status(500).json({
          error: 'Failed to update published_digest_state.json',
          githubStatus: putFinalResp.status,
          details: putFinalText
        });
      }

      const workflowResp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/workflows/.github%2Fworkflows%2Fdaily-digest.yml/dispatches`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ ref: branch })
        }
      );

      console.log("Workflow dispatch status after publish:", workflowResp.status);

      if (workflowResp.status !== 204 && !workflowResp.ok) {
        const workflowText = await workflowResp.text();
        console.log("Workflow dispatch response after publish:", workflowText);

        return res.status(500).json({
          error: 'Publish state updated, but workflow dispatch failed',
          details: workflowText
        });
      }

      console.log("Publish action completed successfully");
      return res.status(200).json({
        success: true,
        message: 'Digest finalized and workflow triggered'
      });
    }

    console.log("Received flaggedUrls:", flaggedUrls);

    if (!Array.isArray(flaggedUrls) || flaggedUrls.length === 0) {
      console.log("No flagged URLs received");
      return res.status(400).json({ error: 'No flagged URLs received' });
    }

    const path = 'flagged_urls.json';

    const getFileResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      { headers }
    );
    console.log("GET existing file status:", getFileResp.status);

    let sha = null;
    let existing = [];

    if (getFileResp.ok) {
      const fileData = await getFileResp.json();
      sha = fileData.sha;
      const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
      existing = JSON.parse(decoded);
      console.log("Existing flagged URLs:", existing);
    } else {
      const getText = await getFileResp.text();
      console.log("GET existing file response:", getText);
    }

    const merged = [...new Set([...(Array.isArray(existing) ? existing : []), ...flaggedUrls])];
    console.log("Merged flagged URLs:", merged);

    const content = Buffer.from(JSON.stringify(merged, null, 2)).toString('base64');

    const updateResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          message: 'Update flagged URLs from review page',
          content,
          sha,
          branch,
        }),
      }
    );

    console.log("PUT update file status:", updateResp.status);
    const updateText = await updateResp.text();
    console.log("PUT update file response:", updateText);

    if (!updateResp.ok) {
      return res.status(500).json({
        error: 'Failed to update flagged_urls.json',
        githubStatus: updateResp.status,
        details: updateText,
      });
    }

    const workflowResp = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/.github%2Fworkflows%2Fdaily-digest.yml/dispatches`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ ref: branch }),
      }
    );

    console.log("Workflow dispatch status:", workflowResp.status);

    if (workflowResp.status !== 204 && !workflowResp.ok) {
      const workflowText = await workflowResp.text();
      console.log("Workflow dispatch response:", workflowText);

      return res.status(500).json({
        error: 'flagged_urls.json updated, but workflow dispatch failed',
        details: workflowText,
      });
    }

    console.log("Workflow dispatch accepted successfully");
    return res.status(200).json({
      success: true,
      message: 'Flagged URLs saved and workflow triggered',
      count: merged.length,
    });
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: 'Server error',
      details: error.message,
    });
  }
}
