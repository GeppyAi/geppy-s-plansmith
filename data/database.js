const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'plansmith.db');
const db = new sqlite3.Database(dbPath);

// Helper for running queries with async/await
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Initialize tables
function initDb() {
  db.serialize(() => {
    // Global Source of Truth Assets
    db.run(`
      CREATE TABLE IF NOT EXISTS global_assets (
        asset_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        file_path TEXT NOT NULL,
        mutability_rules TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Projects
    db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        project_type TEXT NOT NULL DEFAULT 'software',
        description TEXT,
        github_repo TEXT,
        github_branch TEXT DEFAULT 'main',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Many-to-Many: Projects to Assets
    db.run(`
      CREATE TABLE IF NOT EXISTS project_asset_links (
        project_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        PRIMARY KEY (project_id, asset_id),
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
        FOREIGN KEY(asset_id) REFERENCES global_assets(asset_id) ON DELETE CASCADE
      )
    `);

    // Project States (Locked In, Parking Lot, Discarded)
    db.run(`
      CREATE TABLE IF NOT EXISTS project_states (
        state_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        bucket TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT,
        milestone_phase INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      )
    `);

    // Chat History for Active AI Interviewer
    db.run(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        message_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      )
    `);

    console.log('[SQLite] Database initialized at:', dbPath);
  });
}

initDb();

module.exports = {
  db,
  run,
  get,
  all
};
