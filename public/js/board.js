// Live State Board Controller (Locked, Parking Lot, Discarded)

let currentPhaseFilter = 'all';

function renderBoard(states = []) {
  // Update State Item Counters
  const locked = states.filter(s => s.bucket === 'locked');
  const parking = states.filter(s => s.bucket === 'parking_lot');
  const discarded = states.filter(s => s.bucket === 'discarded');

  document.getElementById('countLocked').textContent = locked.length;
  document.getElementById('countParking').textContent = parking.length;
  document.getElementById('countDiscarded').textContent = discarded.length;
  document.getElementById('miniBoardCount').textContent = `${states.length} items`;

  document.getElementById('fullCountLocked').textContent = locked.length;
  document.getElementById('fullCountParking').textContent = parking.length;
  document.getElementById('fullCountDiscarded').textContent = discarded.length;

  // Filter items by phase if selected
  const filterPhase = currentPhaseFilter !== 'all' ? parseInt(currentPhaseFilter, 10) : null;
  const filteredStates = filterPhase 
    ? states.filter(s => (s.milestone_phase || 1) === filterPhase)
    : states;

  // Render Mini-Board Buckets
  renderMiniBucket('miniBucketLocked', filteredStates.filter(s => s.bucket === 'locked'), 'emerald');
  renderMiniBucket('miniBucketParking', filteredStates.filter(s => s.bucket === 'parking_lot'), 'amber');
  renderMiniBucket('miniBucketDiscarded', filteredStates.filter(s => s.bucket === 'discarded'), 'rose');

  // Render Full Kanban Board Buckets
  renderFullBucket('fullBucketLocked', filteredStates.filter(s => s.bucket === 'locked'), 'emerald');
  renderFullBucket('fullBucketParking', filteredStates.filter(s => s.bucket === 'parking_lot'), 'amber');
  renderFullBucket('fullBucketDiscarded', filteredStates.filter(s => s.bucket === 'discarded'), 'rose');
}

function renderMiniBucket(elementId, items, color) {
  const container = document.getElementById(elementId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<div class="text-slate-500 italic p-2 text-[11px]">No items</div>`;
    return;
  }

  container.innerHTML = '';
  items.forEach(item => {
    const div = document.createElement('div');
    div.className = `p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 flex items-start justify-between gap-2`;
    div.innerHTML = `
      <div class="space-y-0.5">
        <p class="font-medium leading-snug">${item.content}</p>
        <div class="flex items-center gap-1.5 text-[10px] text-slate-400">
          <span class="px-1 py-0.5 bg-slate-800 rounded font-mono">P${item.milestone_phase || 1}</span>
          <span class="text-slate-500">${item.category || 'general'}</span>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderFullBucket(elementId, items, color) {
  const container = document.getElementById(elementId);
  if (!container) return;

  if (items.length === 0) {
    container.innerHTML = `<div class="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">Bucket is empty</div>`;
    return;
  }

  const borderColors = {
    emerald: 'hover:border-emerald-500/40',
    amber: 'hover:border-amber-500/40',
    rose: 'hover:border-rose-500/40'
  };

  container.innerHTML = '';
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = `kanban-card p-4 rounded-xl bg-slate-950 border border-slate-800 ${borderColors[color]} text-slate-200 space-y-3 shadow-md`;
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <p class="text-sm font-medium leading-relaxed">${item.content}</p>
        <button data-id="${item.state_id}" class="btn-delete-state text-slate-500 hover:text-rose-400 transition text-xs p-1">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <div class="flex items-center justify-between pt-2 border-t border-slate-900 text-xs">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] border border-slate-700">Phase ${item.milestone_phase || 1}</span>
          <span class="text-slate-400 font-semibold text-[10px] uppercase tracking-wider">${item.category || 'architecture'}</span>
        </div>

        <!-- Quick Move Actions -->
        <div class="flex items-center gap-1">
          ${item.bucket !== 'locked' ? `<button data-id="${item.state_id}" data-target="locked" class="btn-move-state px-2 py-1 bg-emerald-950/60 text-emerald-400 hover:bg-emerald-900/60 rounded text-[10px] border border-emerald-500/30">Lock</button>` : ''}
          ${item.bucket !== 'parking_lot' ? `<button data-id="${item.state_id}" data-target="parking_lot" class="btn-move-state px-2 py-1 bg-amber-950/60 text-amber-400 hover:bg-amber-900/60 rounded text-[10px] border border-amber-500/30">Park</button>` : ''}
          ${item.bucket !== 'discarded' ? `<button data-id="${item.state_id}" data-target="discarded" class="btn-move-state px-2 py-1 bg-rose-950/60 text-rose-400 hover:bg-rose-900/60 rounded text-[10px] border border-rose-500/30">Discard</button>` : ''}
        </div>
      </div>
    `;

    container.appendChild(card);
  });

  // Attach button click events
  container.querySelectorAll('.btn-move-state').forEach(btn => {
    btn.addEventListener('click', () => {
      moveStateItem(btn.getAttribute('data-id'), btn.getAttribute('data-target'));
    });
  });

  container.querySelectorAll('.btn-delete-state').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteStateItem(btn.getAttribute('data-id'));
    });
  });
}

// Move item to different bucket
async function moveStateItem(stateId, targetBucket) {
  if (!window.state.currentProject) return;
  const projectId = window.state.currentProject.project_id;

  try {
    const data = await window.apiFetch(`/api/projects/${projectId}/states/${stateId}`, {
      method: 'PUT',
      body: JSON.stringify({ bucket: targetBucket })
    });

    // Update local state item
    const idx = window.state.currentProject.states.findIndex(s => s.state_id === stateId);
    if (idx !== -1) {
      window.state.currentProject.states[idx] = data.state;
      renderBoard(window.state.currentProject.states);
    }
    window.showToast(`Moved item to ${targetBucket.replace('_', ' ')}`, 'info');
  } catch (err) {
    console.error(err);
  }
}

// Delete item
async function deleteStateItem(stateId) {
  if (!window.state.currentProject) return;
  const projectId = window.state.currentProject.project_id;

  try {
    await window.apiFetch(`/api/projects/${projectId}/states/${stateId}`, {
      method: 'DELETE'
    });

    window.state.currentProject.states = window.state.currentProject.states.filter(s => s.state_id !== stateId);
    renderBoard(window.state.currentProject.states);
    window.showToast('Item deleted', 'info');
  } catch (err) {
    console.error(err);
  }
}

// Init Add Item Modal Form
function initBoardActions() {
  document.getElementById('btnAddStateItem')?.addEventListener('click', () => {
    if (!window.state.currentProject) {
      window.showToast('Please select a project first', 'warning');
      return;
    }
    document.getElementById('modalAddStateItem').classList.remove('hidden');
  });

  document.getElementById('formAddStateItem')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.state.currentProject) return;

    const projectId = window.state.currentProject.project_id;
    const bucket = document.getElementById('stateBucketInput').value;
    const content = document.getElementById('stateContentInput').value.trim();
    const category = document.getElementById('stateCategoryInput').value.trim() || 'architecture';
    const milestone_phase = parseInt(document.getElementById('statePhaseInput').value, 10) || 1;

    if (!content) return;

    try {
      const data = await window.apiFetch(`/api/projects/${projectId}/states`, {
        method: 'POST',
        body: JSON.stringify({ bucket, content, category, milestone_phase })
      });

      if (!window.state.currentProject.states) window.state.currentProject.states = [];
      window.state.currentProject.states.push(data.state);
      renderBoard(window.state.currentProject.states);

      document.getElementById('modalAddStateItem').classList.add('hidden');
      document.getElementById('formAddStateItem').reset();
      window.showToast('Added item to decision board', 'success');
    } catch (err) {
      console.error(err);
    }
  });

  document.getElementById('phaseFilter')?.addEventListener('change', (e) => {
    currentPhaseFilter = e.target.value;
    if (window.state.currentProject) {
      renderBoard(window.state.currentProject.states || []);
    }
  });
}

document.addEventListener('DOMContentLoaded', initBoardActions);
window.renderBoard = renderBoard;
