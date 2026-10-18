// PlanSmith Global Application State & Controller

const state = {
  currentProject: null,
  projects: [],
  assets: [],
  activeTab: 'studio'
};

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const bgColors = {
    info: 'bg-slate-800 border-indigo-500 text-indigo-200',
    success: 'bg-slate-800 border-emerald-500 text-emerald-200',
    warning: 'bg-slate-800 border-amber-500 text-amber-200',
    error: 'bg-slate-800 border-rose-500 text-rose-200'
  };

  const icons = {
    info: 'fa-circle-info text-indigo-400',
    success: 'fa-circle-check text-emerald-400',
    warning: 'fa-triangle-exclamation text-amber-400',
    error: 'fa-circle-exclamation text-rose-400'
  };

  const toast = document.createElement('div');
  toast.className = `toast pointer-events-auto px-4 py-3 rounded-xl border shadow-xl text-xs font-medium flex items-center gap-2.5 max-w-sm ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}"></i> <span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Fetch API helper
async function apiFetch(endpoint, options = {}) {
  try {
    const res = await fetch(endpoint, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    const data = await res.json();
    if (!data.success && data.error) {
      throw new Error(data.error);
    }
    return data;
  } catch (err) {
    showToast(err.message || 'API request failed', 'error');
    throw err;
  }
}

// Load System Status
async function checkSystemStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    const badgeText = document.getElementById('geminiStatusText');
    const badge = document.getElementById('geminiStatusBadge');

    if (data.gemini_key_configured) {
      badgeText.textContent = 'Gemini AI Ready';
      badge.classList.remove('border-slate-700');
      badge.classList.add('border-emerald-500/40', 'bg-emerald-950/20', 'text-emerald-300');
    } else {
      badgeText.textContent = 'Manual Local Mode';
      badge.classList.remove('border-slate-700');
      badge.classList.add('border-amber-500/40', 'bg-amber-950/20', 'text-amber-300');
    }
  } catch (e) {
    console.warn('[Status] Could not reach status API');
  }
}

// Load Projects List
async function loadProjects() {
  try {
    const data = await apiFetch('/api/projects');
    state.projects = data.projects || [];
    const select = document.getElementById('projectSelect');
    select.innerHTML = '<option value="">-- Select Project --</option>';

    state.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.project_id;
      opt.textContent = `${p.title} (${p.project_type.toUpperCase()})`;
      select.appendChild(opt);
    });

    // Auto select first project if available and none selected
    if (!state.currentProject && state.projects.length > 0) {
      selectProject(state.projects[0].project_id);
    } else if (state.currentProject) {
      select.value = state.currentProject.project_id;
    }
  } catch (err) {
    console.error('Failed to load projects:', err);
  }
}

// Select Active Project
async function selectProject(projectId) {
  if (!projectId) {
    state.currentProject = null;
    document.getElementById('chatProjectTitle').textContent = 'Select or create a project to start scoping';
    window.renderChatTranscript([]);
    window.renderBoard([]);
    return;
  }

  try {
    const data = await apiFetch(`/api/projects/${projectId}`);
    state.currentProject = data.project;

    const select = document.getElementById('projectSelect');
    select.value = projectId;

    document.getElementById('chatProjectTitle').textContent = `${state.currentProject.title} — ${state.currentProject.project_type.toUpperCase()}`;

    // Update child components
    if (window.renderChatTranscript) {
      window.renderChatTranscript(state.currentProject.chat_history || []);
    }
    if (window.renderBoard) {
      window.renderBoard(state.currentProject.states || []);
    }
    if (window.renderExporter) {
      window.renderExporter(projectId);
    }
  } catch (err) {
    console.error('Failed to select project:', err);
  }
}

// Initialize Navigation Tabs
function initNavTabs() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
      const targetView = document.getElementById(`view-${targetTab}`);
      if (targetView) targetView.classList.add('active');

      state.activeTab = targetTab;

      // Refresh specific tab contents on switch
      if (targetTab === 'vault' && window.loadAssets) {
        window.loadAssets();
      } else if (targetTab === 'exporter' && state.currentProject && window.renderExporter) {
        window.renderExporter(state.currentProject.project_id);
      }
    });
  });
}

// Initialize Modals
function initModals() {
  const closeBtns = document.querySelectorAll('.close-modal');
  closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.fixed.inset-0').forEach(m => m.classList.add('hidden'));
    });
  });

  // Open New Project Modal
  document.getElementById('btnNewProject')?.addEventListener('click', () => {
    document.getElementById('modalNewProject').classList.remove('hidden');
  });

  // Handle New Project Form
  document.getElementById('formNewProject')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('newProjectTitle').value.trim();
    const project_type = document.getElementById('newProjectType').value;
    const description = document.getElementById('newProjectDesc').value.trim();
    const github_repo = document.getElementById('newProjectRepo').value.trim();

    if (!title) return;

    try {
      const data = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ title, project_type, description, github_repo })
      });

      showToast(`Created project: ${data.project.title}`, 'success');
      document.getElementById('modalNewProject').classList.add('hidden');
      document.getElementById('formNewProject').reset();
      await loadProjects();
      selectProject(data.project.project_id);
    } catch (err) {
      console.error(err);
    }
  });

  // Project Select Change Listener
  document.getElementById('projectSelect')?.addEventListener('change', (e) => {
    selectProject(e.target.value);
  });
}

// Document Ready Setup
document.addEventListener('DOMContentLoaded', () => {
  checkSystemStatus();
  initNavTabs();
  initModals();
  loadProjects();
});

// Export global helpers
window.state = state;
window.showToast = showToast;
window.apiFetch = apiFetch;
window.selectProject = selectProject;
