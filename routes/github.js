const express = require('express');
const router = express.Router();
const { Octokit } = require('octokit');
const crypto = require('crypto');
const { GoogleGenAI } = require('@google/genai');
const { run, get, all } = require('../data/database');

function getOctokit(token) {
  const auth = token || process.env.GITHUB_TOKEN;
  return new Octokit(auth ? { auth } : {});
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
}

// POST scan repository
router.post('/scan', async (req, res) => {
  try {
    const { repo, branch, project_id, token } = req.body;
    if (!repo) {
      return res.status(400).json({ success: false, error: 'Repository (e.g. "owner/repo") is required' });
    }

    const [owner, repoName] = repo.split('/');
    if (!owner || !repoName) {
      return res.status(400).json({ success: false, error: 'Invalid repository format. Use "owner/repo"' });
    }

    const octokit = getOctokit(token);
    const targetBranch = branch || 'main';

    // Fetch repository tree
    let treeFiles = [];
    try {
      const treeRes = await octokit.rest.git.getTree({
        owner,
        repo: repoName,
        tree_sha: targetBranch,
        recursive: 'true'
      });
      treeFiles = (treeRes.data.tree || []).map(item => item.path).slice(0, 150); // limit top 150 paths
    } catch (e) {
      console.warn('[GitHub] Could not fetch recursive tree, falling back to root contents:', e.message);
      const rootRes = await octokit.rest.repos.getContent({
        owner,
        repo: repoName,
        path: '',
        ref: targetBranch
      });
      if (Array.isArray(rootRes.data)) {
        treeFiles = rootRes.data.map(item => item.path);
      }
    }

    // Helper to fetch file content text safely
    async function fetchFileText(filePath) {
      try {
        const fileRes = await octokit.rest.repos.getContent({
          owner,
          repo: repoName,
          path: filePath,
          ref: targetBranch
        });
        if (fileRes.data && fileRes.data.content) {
          return Buffer.from(fileRes.data.content, 'base64').toString('utf8');
        }
      } catch (err) {
        return null;
      }
      return null;
    }

    const packageJson = await fetchFileText('package.json');
    const requirementsTxt = await fetchFileText('requirements.txt');
    const readmeMd = await fetchFileText('README.md');
    const dockerfile = await fetchFileText('Dockerfile');

    const repoContext = {
      repo: `${owner}/${repoName}`,
      branch: targetBranch,
      treeFiles: treeFiles.slice(0, 80),
      hasPackageJson: !!packageJson,
      packageJsonSnippet: packageJson ? packageJson.slice(0, 1500) : null,
      hasRequirementsTxt: !!requirementsTxt,
      requirementsTxtSnippet: requirementsTxt ? requirementsTxt.slice(0, 1500) : null,
      hasReadme: !!readmeMd,
      readmeSnippet: readmeMd ? readmeMd.slice(0, 1000) : null,
      hasDockerfile: !!dockerfile
    };

    // Use Gemini API to analyze repository and reverse-engineer architectural state items
    let discoveredItems = [];
    const ai = getGeminiClient();

    if (ai) {
      try {
        const prompt = `
You are a Lead Software Architect scanning a GitHub repository to reverse-engineer its tech stack, architecture, and core modules.

Repository metadata:
- Name: ${repoContext.repo}
- Branch: ${repoContext.branch}
- File Tree Sample: ${JSON.stringify(repoContext.treeFiles)}
- package.json: ${repoContext.packageJsonSnippet || 'N/A'}
- requirements.txt: ${repoContext.requirementsTxtSnippet || 'N/A'}
- README snippet: ${repoContext.readmeSnippet || 'N/A'}

Analyze this project and extract 5 to 10 structured architectural components, tech stack items, and core features for a "Locked In" project implementation plan.

Return strictly JSON matching this schema:
{
  "summary": "Short 2-sentence repository summary",
  "tech_stack": ["item1", "item2"],
  "locked_items": [
    {
      "content": "Specific technical decision or architectural feature",
      "category": "architecture|tech_stack|infrastructure|database|feature",
      "milestone_phase": 1
    }
  ]
}
`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const resText = response.text;
        const parsed = JSON.parse(resText);
        discoveredItems = parsed.locked_items || [];
        repoContext.aiSummary = parsed.summary;
        repoContext.techStackList = parsed.tech_stack;
      } catch (geminiErr) {
        console.warn('[Gemini Scanner] Error during AI parsing:', geminiErr.message);
      }
    }

    // Fallback parsing if Gemini was unavailable or returned empty
    if (discoveredItems.length === 0) {
      discoveredItems.push({
        content: `Target Repository: ${owner}/${repoName} (${targetBranch})`,
        category: 'infrastructure',
        milestone_phase: 1
      });

      if (packageJson) {
        try {
          const pkg = JSON.parse(packageJson);
          const deps = Object.keys(pkg.dependencies || {}).concat(Object.keys(pkg.devDependencies || {}));
          discoveredItems.push({
            content: `Node.js Ecosystem with dependencies: ${deps.slice(0, 8).join(', ')}`,
            category: 'tech_stack',
            milestone_phase: 1
          });
        } catch (e) {}
      }

      if (requirementsTxt) {
        discoveredItems.push({
          content: `Python Ecosystem: ${requirementsTxt.split('\n').filter(Boolean).slice(0, 6).join(', ')}`,
          category: 'tech_stack',
          milestone_phase: 1
        });
      }

      if (dockerfile) {
        discoveredItems.push({
          content: `Containerized Deployment via Dockerfile`,
          category: 'infrastructure',
          milestone_phase: 1
        });
      }
    }

    // If project_id provided, auto-populate project state with Locked In items!
    if (project_id) {
      for (const item of discoveredItems) {
        const state_id = `st_${crypto.randomBytes(8).toString('hex')}`;
        await run(
          `INSERT INTO project_states (state_id, project_id, bucket, content, category, milestone_phase)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            state_id,
            project_id,
            'locked',
            item.content,
            item.category || 'architecture',
            item.milestone_phase || 1
          ]
        );
      }

      // Update project github_repo
      await run(`UPDATE projects SET github_repo = ?, github_branch = ? WHERE project_id = ?`, [
        `${owner}/${repoName}`,
        targetBranch,
        project_id
      ]);
    }

    res.json({
      success: true,
      repoContext,
      discoveredItems
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST sync milestone checklist to GitHub issues
router.post('/sync-issues', async (req, res) => {
  try {
    const { project_id, token } = req.body;
    const project = await get(`SELECT * FROM projects WHERE project_id = ?`, [project_id]);
    if (!project || !project.github_repo) {
      return res.status(400).json({ success: false, error: 'Project does not have a linked GitHub repository' });
    }

    const [owner, repoName] = project.github_repo.split('/');
    const octokit = getOctokit(token);

    const lockedStates = await all(
      `SELECT * FROM project_states WHERE project_id = ? AND bucket = 'locked' ORDER BY milestone_phase ASC`,
      [project_id]
    );

    if (lockedStates.length === 0) {
      return res.status(400).json({ success: false, error: 'No locked decisions to sync as milestones' });
    }

    // Group items by milestone phase
    const phases = {};
    for (const item of lockedStates) {
      const p = item.milestone_phase || 1;
      if (!phases[p]) phases[p] = [];
      phases[p].push(item);
    }

    const createdIssues = [];
    for (const phaseNum of Object.keys(phases)) {
      const items = phases[phaseNum];
      const issueTitle = `[PlanSmith] Phase ${phaseNum} Milestones: ${project.title}`;
      const issueBody = `## PlanSmith Execution Milestones - Phase ${phaseNum}\n\n` +
        items.map(it => `- [ ] **[${it.category.toUpperCase()}]** ${it.content}`).join('\n') +
        `\n\n*Generated locally by PlanSmith Studio for ${project.title}*`;

      try {
        const issueRes = await octokit.rest.issues.create({
          owner,
          repo: repoName,
          title: issueTitle,
          body: issueBody,
          labels: ['plansmith-milestone']
        });
        createdIssues.push({ title: issueTitle, url: issueRes.data.html_url });
      } catch (err) {
        console.warn(`[GitHub Sync] Could not create issue for Phase ${phaseNum}:`, err.message);
        createdIssues.push({ title: issueTitle, error: err.message });
      }
    }

    res.json({ success: true, createdIssues });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
