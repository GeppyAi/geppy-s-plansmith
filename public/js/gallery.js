// Global Source of Truth Gallery Controller

async function loadAssets() {
  const container = document.getElementById('assetsGrid');
  if (!container) return;

  try {
    const data = await window.apiFetch('/api/assets');
    const assets = data.assets || [];

    if (assets.length === 0) {
      container.innerHTML = `
        <div class="col-span-full text-center py-16 bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl">
          <i class="fa-solid fa-vault text-4xl text-slate-700 mb-3"></i>
          <h3 class="text-sm font-bold text-slate-400">Vault is empty</h3>
          <p class="text-xs text-slate-500 mt-1">Upload brand logos, mascots, or UI specs to enforce governance rules across projects.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    assets.forEach(ast => {
      const card = document.createElement('div');
      card.className = 'bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 shadow-xl transition flex flex-col justify-between';

      const isImage = /\.(png|jpe?g|svg|webp|gif)$/i.test(ast.file_path);
      const previewHtml = isImage 
        ? `<img src="${ast.file_path}" alt="${ast.name}" class="h-32 w-full object-contain rounded-xl bg-slate-950/60 p-2 border border-slate-800">`
        : `<div class="h-32 w-full rounded-xl bg-slate-950/60 flex items-center justify-center text-slate-500 border border-slate-800"><i class="fa-solid fa-file-lines text-3xl"></i></div>`;

      const rules = ast.mutability_rules || {};
      const rulesString = Object.keys(rules).length > 0 ? JSON.stringify(rules, null, 2) : 'No explicit constraints';

      // Check if linked to active project
      const isLinked = window.state.currentProject && 
        window.state.currentProject.linked_assets && 
        window.state.currentProject.linked_assets.some(l => l.asset_id === ast.asset_id);

      card.innerHTML = `
        <div class="space-y-3">
          ${previewHtml}
          <div>
            <div class="flex items-center justify-between">
              <h4 class="font-bold text-sm text-slate-200">${ast.name}</h4>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 font-semibold border border-indigo-500/30">${ast.type.toUpperCase()}</span>
            </div>
            <p class="text-[11px] text-slate-400 mt-1 font-mono break-all">${ast.file_path}</p>
          </div>

          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800 space-y-1">
            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Governance Rules:</span>
            <pre class="text-[10px] text-emerald-400 font-mono overflow-x-auto whitespace-pre-wrap">${rulesString}</pre>
          </div>
        </div>

        <div class="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
          <button data-id="${ast.asset_id}" class="${isLinked ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border-slate-700'} btn-link-asset px-3 py-1.5 rounded-lg border font-medium transition flex items-center gap-1.5">
            <i class="fa-solid ${isLinked ? 'fa-link-slash text-emerald-400' : 'fa-link text-indigo-400'}"></i>
            <span>${isLinked ? 'Linked to Project' : 'Link to Project'}</span>
          </button>
          
          <button data-id="${ast.asset_id}" class="btn-delete-asset text-slate-500 hover:text-rose-400 p-1 transition">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;

      container.appendChild(card);
    });

    // Attach event handlers
    container.querySelectorAll('.btn-link-asset').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleLinkAsset(btn.getAttribute('data-id'));
      });
    });

    container.querySelectorAll('.btn-delete-asset').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteAsset(btn.getAttribute('data-id'));
      });
    });
  } catch (err) {
    console.error('Failed to load gallery assets:', err);
  }
}

// Toggle link asset to current project
async function toggleLinkAsset(assetId) {
  if (!window.state.currentProject) {
    window.showToast('Select an active project first', 'warning');
    return;
  }

  const projectId = window.state.currentProject.project_id;
  const isLinked = window.state.currentProject.linked_assets && 
    window.state.currentProject.linked_assets.some(l => l.asset_id === assetId);

  try {
    if (isLinked) {
      await window.apiFetch(`/api/projects/${projectId}/assets/link/${assetId}`, { method: 'DELETE' });
      window.showToast('Unlinked asset from project', 'info');
    } else {
      await window.apiFetch(`/api/projects/${projectId}/assets/link`, {
        method: 'POST',
        body: JSON.stringify({ asset_id: assetId })
      });
      window.showToast('Linked asset to project', 'success');
    }

    // Refresh project details
    await window.selectProject(projectId);
    loadAssets();
  } catch (err) {
    console.error(err);
  }
}

// Delete asset
async function deleteAsset(assetId) {
  try {
    await window.apiFetch(`/api/assets/${assetId}`, { method: 'DELETE' });
    window.showToast('Asset deleted from vault', 'info');
    loadAssets();
  } catch (err) {
    console.error(err);
  }
}

// Init Gallery Modals & Forms
function initGallery() {
  document.getElementById('btnUploadAsset')?.addEventListener('click', () => {
    document.getElementById('modalUploadAsset').classList.remove('hidden');
  });

  document.getElementById('formUploadAsset')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('assetFileInput');
    const name = document.getElementById('assetNameInput').value.trim();
    const type = document.getElementById('assetTypeInput').value;
    const rulesRaw = document.getElementById('assetRulesInput').value.trim();

    if (!fileInput.files || fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    if (name) formData.append('name', name);
    formData.append('type', type);
    if (rulesRaw) formData.append('mutability_rules', rulesRaw);

    try {
      const res = await fetch('/api/assets/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      window.showToast(`Uploaded asset: ${data.asset.name}`, 'success');
      document.getElementById('modalUploadAsset').classList.add('hidden');
      document.getElementById('formUploadAsset').reset();
      loadAssets();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', initGallery);
window.loadAssets = loadAssets;
