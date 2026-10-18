// Multi-Format Spec Exporter Controller

let currentExportMarkdown = '';
let currentExportJSON = null;

async function renderExporter(projectId) {
  const preview = document.getElementById('exportMarkdownPreview');
  if (!preview) return;

  if (!projectId) {
    preview.innerHTML = `<div class="text-slate-500 text-center py-12">Select a project to generate and preview its implementation spec.</div>`;
    return;
  }

  try {
    // Fetch Markdown export
    const resMd = await fetch(`/api/export/${projectId}?format=markdown`);
    currentExportMarkdown = await resMd.text();

    // Fetch JSON export
    const resJson = await fetch(`/api/export/${projectId}?format=json`);
    currentExportJSON = await resJson.json();

    const parsedHtml = window.marked ? window.marked.parse(currentExportMarkdown) : currentExportMarkdown;
    preview.innerHTML = parsedHtml;
  } catch (err) {
    console.error('Failed to render export preview:', err);
  }
}

// Download Markdown File
function downloadMarkdown() {
  if (!currentExportMarkdown || !window.state.currentProject) {
    window.showToast('No active export spec available to download', 'warning');
    return;
  }

  const filename = `${window.state.currentProject.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_implementation_spec.md`;
  const blob = new Blob([currentExportMarkdown], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  window.showToast(`Downloaded ${filename}`, 'success');
}

// Download JSON File
function downloadJSON() {
  if (!currentExportJSON || !window.state.currentProject) {
    window.showToast('No active export spec available to download', 'warning');
    return;
  }

  const filename = `${window.state.currentProject.title.toLowerCase().replace(/[^a-z0-9]/g, '_')}_spec.json`;
  const jsonStr = JSON.stringify(currentExportJSON, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  window.showToast(`Downloaded ${filename}`, 'success');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnDownloadMarkdown')?.addEventListener('click', downloadMarkdown);
  document.getElementById('btnDownloadJSON')?.addEventListener('click', downloadJSON);
});

window.renderExporter = renderExporter;
