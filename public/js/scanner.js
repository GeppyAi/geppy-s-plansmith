// GitHub Scanner & Reverse Engineering Controller

async function handleRunScan() {
  const repo = document.getElementById('scanRepoInput').value.trim();
  const branch = document.getElementById('scanBranchInput').value.trim() || 'main';
  const container = document.getElementById('scanResultsContainer');
  const btn = document.getElementById('btnRunScan');

  if (!repo) {
    window.showToast('Please enter a target repository (owner/repo)', 'warning');
    return;
  }

  const projectId = window.state.currentProject ? window.state.currentProject.project_id : null;

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i> Scanning Repo...';

  try {
    const data = await window.apiFetch('/api/github/scan', {
      method: 'POST',
      body: JSON.stringify({ repo, branch, project_id: projectId })
    });

    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Scan & Reverse Engineer';
    container.classList.remove('hidden');

    // Render summary box
    const summaryBox = document.getElementById('scanSummaryBox');
    summaryBox.innerHTML = `
      <p class="font-bold text-slate-200 mb-1">Scanned: ${data.repoContext.repo} (${data.repoContext.branch})</p>
      <p class="text-slate-300 leading-relaxed">${data.repoContext.aiSummary || 'Repository structure scanned successfully.'}</p>
      ${data.repoContext.techStackList ? `<div class="mt-2 flex flex-wrap gap-1.5">${data.repoContext.techStackList.map(t => `<span class="px-2 py-0.5 rounded bg-purple-950/60 border border-purple-500/30 text-purple-300 font-mono text-[10px]">${t}</span>`).join('')}</div>` : ''}
    `;

    // Render extracted items
    const itemsContainer = document.getElementById('scanExtractedItems');
    itemsContainer.innerHTML = '';

    (data.discoveredItems || []).forEach(item => {
      const card = document.createElement('div');
      card.className = 'p-3 rounded-xl bg-slate-950 border border-purple-500/20 text-xs flex items-center justify-between gap-3';
      card.innerHTML = `
        <div class="space-y-1">
          <p class="font-medium text-slate-200">${item.content}</p>
          <div class="flex items-center gap-2">
            <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono text-[10px]">Phase ${item.milestone_phase || 1}</span>
            <span class="text-purple-400 font-semibold text-[10px] uppercase">${item.category || 'architecture'}</span>
          </div>
        </div>
        <span class="text-[10px] px-2 py-1 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 shrink-0">Auto-Locked</span>
      `;
      itemsContainer.appendChild(card);
    });

    window.showToast(`Reverse-engineered repository and auto-populated ${data.discoveredItems.length} locked decision(s)`, 'success');

    // Refresh project state board if project active
    if (projectId) {
      await window.selectProject(projectId);
    }
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Scan & Reverse Engineer';
    console.error(err);
  }
}

// Sync Milestones to GitHub Issues
async function handleSyncGithubIssues() {
  if (!window.state.currentProject) {
    window.showToast('Please select a project first', 'warning');
    return;
  }

  const projectId = window.state.currentProject.project_id;
  try {
    const data = await window.apiFetch('/api/github/sync-issues', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId })
    });

    window.showToast(`Created ${data.createdIssues.length} GitHub milestone issue(s)`, 'success');
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnRunScan')?.addEventListener('click', handleRunScan);
  document.getElementById('btnSyncGithubIssues')?.addEventListener('click', handleSyncGithubIssues);
});
