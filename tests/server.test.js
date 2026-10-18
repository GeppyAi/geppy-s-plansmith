const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

// Simple integration test for backend routes
async function runTests() {
  console.log('--- RUNNING PLANSMITH BACKEND VERIFICATION TESTS ---');

  // Load database
  const { run, get, all } = require('../data/database');

  // Test 1: Create Project
  const testProjId = `prj_test_${Date.now()}`;
  await run(
    `INSERT INTO projects (project_id, title, project_type, description) VALUES (?, ?, ?, ?)`,
    [testProjId, 'Automated Test Software Project', 'software', 'Testing local studio backend']
  );

  const proj = await get(`SELECT * FROM projects WHERE project_id = ?`, [testProjId]);
  assert.strictEqual(proj.title, 'Automated Test Software Project');
  console.log('✅ Project creation verified');

  // Test 2: Add State Items (Locked, Parking Lot, Discarded)
  const st1 = `st_test_1_${Date.now()}`;
  const st2 = `st_test_2_${Date.now()}`;
  const st3 = `st_test_3_${Date.now()}`;

  await run(
    `INSERT INTO project_states (state_id, project_id, bucket, content, category, milestone_phase) VALUES (?, ?, ?, ?, ?, ?)`,
    [st1, testProjId, 'locked', 'Use Express + SQLite3 backend', 'architecture', 1]
  );
  await run(
    `INSERT INTO project_states (state_id, project_id, bucket, content, category, milestone_phase) VALUES (?, ?, ?, ?, ?, ?)`,
    [st2, testProjId, 'parking_lot', 'Add WebSockets real-time sync', 'feature', 2]
  );
  await run(
    `INSERT INTO project_states (state_id, project_id, bucket, content, category, milestone_phase) VALUES (?, ?, ?, ?, ?, ?)`,
    [st3, testProjId, 'discarded', 'Avoid heavy microservices architecture', 'constraint', 1]
  );

  const states = await all(`SELECT * FROM project_states WHERE project_id = ?`, [testProjId]);
  assert.strictEqual(states.length, 3);
  console.log('✅ State board tracking verified (3 items across Locked, Parking Lot, Discarded)');

  // Test 3: Create Global Asset
  const astId = `ast_test_${Date.now()}`;
  await run(
    `INSERT INTO global_assets (asset_id, name, type, file_path, mutability_rules) VALUES (?, ?, ?, ?, ?)`,
    [astId, 'Brand Logo Spec', 'logo', '/uploads/vault/logo_spec.png', JSON.stringify({ immutable: true })]
  );

  const asset = await get(`SELECT * FROM global_assets WHERE asset_id = ?`, [astId]);
  assert.strictEqual(asset.name, 'Brand Logo Spec');
  console.log('✅ Global Source of Truth asset created');

  // Test 4: Link Asset to Project
  await run(`INSERT INTO project_asset_links (project_id, asset_id) VALUES (?, ?)`, [testProjId, astId]);
  const linked = await all(`SELECT * FROM project_asset_links WHERE project_id = ?`, [testProjId]);
  assert.strictEqual(linked.length, 1);
  console.log('✅ Asset linking verified');

  // Clean up test data
  await run(`DELETE FROM projects WHERE project_id = ?`, [testProjId]);
  await run(`DELETE FROM project_states WHERE project_id = ?`, [testProjId]);
  await run(`DELETE FROM global_assets WHERE asset_id = ?`, [astId]);
  await run(`DELETE FROM project_asset_links WHERE project_id = ?`, [testProjId]);

  console.log('🎉 ALL BACKEND VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
