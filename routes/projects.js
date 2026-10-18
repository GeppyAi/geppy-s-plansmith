const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { run, get, all } = require('../data/database');

// GET all projects
router.get('/', async (req, res) => {
  try {
    const projects = await all(`SELECT * FROM projects ORDER BY updated_at DESC`);
    res.json({ success: true, projects });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET project details with state items, linked assets, and chat history
router.get('/:id', async (req, res) => {
  try {
    const project = await get(`SELECT * FROM projects WHERE project_id = ?`, [req.params.id]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const states = await all(
      `SELECT * FROM project_states WHERE project_id = ? ORDER BY milestone_phase ASC, created_at ASC`,
      [req.params.id]
    );

    const linkedAssets = await all(
      `SELECT a.* FROM global_assets a
       JOIN project_asset_links l ON a.asset_id = l.asset_id
       WHERE l.project_id = ?`,
      [req.params.id]
    );

    const parsedAssets = linkedAssets.map(a => ({
      ...a,
      mutability_rules: JSON.parse(a.mutability_rules || '{}')
    }));

    const chatHistory = await all(
      `SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({
      success: true,
      project: {
        ...project,
        states,
        linked_assets: parsedAssets,
        chat_history: chatHistory
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create project
router.post('/', async (req, res) => {
  try {
    const { title, project_type, description, github_repo, github_branch } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Title is required' });

    const project_id = `prj_${crypto.randomBytes(8).toString('hex')}`;
    const now = new Date().toISOString();

    await run(
      `INSERT INTO projects (project_id, title, project_type, description, github_repo, github_branch, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        project_id,
        title,
        project_type || 'software',
        description || '',
        github_repo || '',
        github_branch || 'main',
        now,
        now
      ]
    );

    // Initial system chat message
    const msg_id = `msg_${crypto.randomBytes(6).toString('hex')}`;
    await run(
      `INSERT INTO chat_messages (message_id, project_id, sender, content) VALUES (?, ?, ?, ?)`,
      [
        msg_id,
        project_id,
        'assistant',
        `Welcome to **${title}**! I am your AI Implementation Architect. Let's outline your goals, architecture, and constraints.`
      ]
    );

    const created = await get(`SELECT * FROM projects WHERE project_id = ?`, [project_id]);
    res.json({ success: true, project: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update project metadata
router.put('/:id', async (req, res) => {
  try {
    const { title, project_type, description, github_repo, github_branch } = req.body;
    const project = await get(`SELECT * FROM projects WHERE project_id = ?`, [req.params.id]);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const now = new Date().toISOString();
    await run(
      `UPDATE projects SET title = ?, project_type = ?, description = ?, github_repo = ?, github_branch = ?, updated_at = ?
       WHERE project_id = ?`,
      [
        title || project.title,
        project_type || project.project_type,
        description !== undefined ? description : project.description,
        github_repo !== undefined ? github_repo : project.github_repo,
        github_branch !== undefined ? github_branch : project.github_branch,
        now,
        req.params.id
      ]
    );

    const updated = await get(`SELECT * FROM projects WHERE project_id = ?`, [req.params.id]);
    res.json({ success: true, project: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE project
router.delete('/:id', async (req, res) => {
  try {
    await run(`DELETE FROM projects WHERE project_id = ?`, [req.params.id]);
    await run(`DELETE FROM project_states WHERE project_id = ?`, [req.params.id]);
    await run(`DELETE FROM project_asset_links WHERE project_id = ?`, [req.params.id]);
    await run(`DELETE FROM chat_messages WHERE project_id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST link asset to project
router.post('/:id/assets/link', async (req, res) => {
  try {
    const { asset_id } = req.body;
    if (!asset_id) return res.status(400).json({ success: false, error: 'asset_id is required' });

    await run(`INSERT OR IGNORE INTO project_asset_links (project_id, asset_id) VALUES (?, ?)`, [
      req.params.id,
      asset_id
    ]);

    res.json({ success: true, message: 'Asset linked to project' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE unlink asset from project
router.delete('/:id/assets/link/:assetId', async (req, res) => {
  try {
    await run(`DELETE FROM project_asset_links WHERE project_id = ? AND asset_id = ?`, [
      req.params.id,
      req.params.assetId
    ]);
    res.json({ success: true, message: 'Asset unlinked from project' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST state item (Locked, Parking Lot, Discarded)
router.post('/:id/states', async (req, res) => {
  try {
    const { bucket, content, category, milestone_phase } = req.body;
    if (!bucket || !content) {
      return res.status(400).json({ success: false, error: 'bucket and content are required' });
    }

    const state_id = `st_${crypto.randomBytes(8).toString('hex')}`;
    await run(
      `INSERT INTO project_states (state_id, project_id, bucket, content, category, milestone_phase)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        state_id,
        req.params.id,
        bucket, // 'locked', 'parking_lot', 'discarded'
        content,
        category || 'general',
        milestone_phase || 1
      ]
    );

    const created = await get(`SELECT * FROM project_states WHERE state_id = ?`, [state_id]);
    res.json({ success: true, state: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update state item (e.g., move bucket or change phase)
router.put('/:id/states/:stateId', async (req, res) => {
  try {
    const { bucket, content, category, milestone_phase } = req.body;
    const current = await get(`SELECT * FROM project_states WHERE state_id = ? AND project_id = ?`, [
      req.params.stateId,
      req.params.id
    ]);

    if (!current) return res.status(404).json({ success: false, error: 'State item not found' });

    await run(
      `UPDATE project_states SET bucket = ?, content = ?, category = ?, milestone_phase = ?
       WHERE state_id = ? AND project_id = ?`,
      [
        bucket || current.bucket,
        content || current.content,
        category || current.category,
        milestone_phase !== undefined ? milestone_phase : current.milestone_phase,
        req.params.stateId,
        req.params.id
      ]
    );

    const updated = await get(`SELECT * FROM project_states WHERE state_id = ?`, [req.params.stateId]);
    res.json({ success: true, state: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE state item
router.delete('/:id/states/:stateId', async (req, res) => {
  try {
    await run(`DELETE FROM project_states WHERE state_id = ? AND project_id = ?`, [
      req.params.stateId,
      req.params.id
    ]);
    res.json({ success: true, message: 'State item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
