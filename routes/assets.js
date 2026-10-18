const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { run, get, all } = require('../data/database');

// Storage directory for uploaded assets
const uploadDir = path.join(__dirname, '..', 'uploads', 'vault');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `asset_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

// GET all global assets
router.get('/', async (req, res) => {
  try {
    const assets = await all(`SELECT * FROM global_assets ORDER BY created_at DESC`);
    const parsed = assets.map(a => ({
      ...a,
      mutability_rules: JSON.parse(a.mutability_rules || '{}')
    }));
    res.json({ success: true, assets: parsed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST upload new asset
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const { name, type, mutability_rules } = req.body;
    const asset_id = `ast_${crypto.randomBytes(8).toString('hex')}`;
    const relativePath = `/uploads/vault/${req.file.filename}`;

    let parsedRules = {};
    if (mutability_rules) {
      try {
        parsedRules = typeof mutability_rules === 'string' ? JSON.parse(mutability_rules) : mutability_rules;
      } catch (e) {
        parsedRules = { note: mutability_rules };
      }
    }

    await run(
      `INSERT INTO global_assets (asset_id, name, type, file_path, mutability_rules) VALUES (?, ?, ?, ?, ?)`,
      [
        asset_id,
        name || req.file.originalname,
        type || 'reference',
        relativePath,
        JSON.stringify(parsedRules)
      ]
    );

    const created = await get(`SELECT * FROM global_assets WHERE asset_id = ?`, [asset_id]);
    res.json({
      success: true,
      asset: {
        ...created,
        mutability_rules: JSON.parse(created.mutability_rules || '{}')
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update asset governance rules / metadata
router.put('/:id', async (req, res) => {
  try {
    const { name, type, mutability_rules } = req.body;
    const asset = await get(`SELECT * FROM global_assets WHERE asset_id = ?`, [req.params.id]);
    if (!asset) return res.status(404).json({ success: false, error: 'Asset not found' });

    const newRules = JSON.stringify(mutability_rules || {});
    await run(
      `UPDATE global_assets SET name = ?, type = ?, mutability_rules = ? WHERE asset_id = ?`,
      [name || asset.name, type || asset.type, newRules, req.params.id]
    );

    const updated = await get(`SELECT * FROM global_assets WHERE asset_id = ?`, [req.params.id]);
    res.json({
      success: true,
      asset: {
        ...updated,
        mutability_rules: JSON.parse(updated.mutability_rules || '{}')
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE asset
router.delete('/:id', async (req, res) => {
  try {
    const asset = await get(`SELECT * FROM global_assets WHERE asset_id = ?`, [req.params.id]);
    if (asset && asset.file_path) {
      const fullPath = path.join(__dirname, '..', asset.file_path);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }
    await run(`DELETE FROM global_assets WHERE asset_id = ?`, [req.params.id]);
    await run(`DELETE FROM project_asset_links WHERE asset_id = ?`, [req.params.id]);
    res.json({ success: true, message: 'Asset deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
