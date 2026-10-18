// Active AI Interviewer Chat Controller

// Render transcript messages
function renderChatTranscript(messages = []) {
  const container = document.getElementById('chatMessages');
  if (!container) return;

  if (messages.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-500 text-sm">
        Select a project or click <strong>New Project</strong> above to begin your active scoping interview session.
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  messages.forEach(msg => {
    const isUser = msg.sender === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `flex gap-3 ${isUser ? 'justify-end' : 'justify-start'}`;

    const icon = isUser 
      ? '<div class="w-8 h-8 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-md">YOU</div>'
      : '<div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold flex items-center justify-center text-xs shrink-0 shadow-md"><i class="fa-solid fa-robot"></i></div>';

    const parsedContent = window.marked ? window.marked.parse(msg.content) : msg.content;

    const bubble = document.createElement('div');
    bubble.className = `max-w-2xl px-4 py-3 text-sm leading-relaxed ${isUser ? 'chat-bubble-user' : 'chat-bubble-assistant'}`;
    bubble.innerHTML = parsedContent;

    if (isUser) {
      wrapper.appendChild(bubble);
      wrapper.appendChild(document.createRange().createContextualFragment(icon));
    } else {
      wrapper.appendChild(document.createRange().createContextualFragment(icon));
      wrapper.appendChild(bubble);
    }

    container.appendChild(wrapper);
  });

  // Auto scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// Submit Chat Message
async function handleSendChat(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const message = input.value.trim();

  if (!message) return;
  if (!window.state.currentProject) {
    window.showToast('Please select or create a project first', 'warning');
    return;
  }

  const projectId = window.state.currentProject.project_id;
  input.value = '';

  // Append user message immediately to UI
  if (!window.state.currentProject.chat_history) {
    window.state.currentProject.chat_history = [];
  }
  window.state.currentProject.chat_history.push({ sender: 'user', content: message });
  renderChatTranscript(window.state.currentProject.chat_history);

  // Append temporary thinking indicator
  const container = document.getElementById('chatMessages');
  const thinkingId = `thinking_${Date.now()}`;
  const thinkingDiv = document.createElement('div');
  thinkingDiv.id = thinkingId;
  thinkingDiv.className = 'flex gap-3 justify-start';
  thinkingDiv.innerHTML = `
    <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-xs shrink-0">
      <i class="fa-solid fa-spinner animate-spin"></i>
    </div>
    <div class="px-4 py-3 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl text-xs italic">
      Analyzing input & updating decision buckets...
    </div>
  `;
  container.appendChild(thinkingDiv);
  container.scrollTop = container.scrollHeight;

  try {
    const data = await window.apiFetch('/api/ai/interview', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, message })
    });

    // Remove thinking indicator
    document.getElementById(thinkingId)?.remove();

    // Push assistant reply
    window.state.currentProject.chat_history.push({
      sender: 'assistant',
      content: data.assistant_reply
    });
    renderChatTranscript(window.state.currentProject.chat_history);

    // Update board state with newly extracted items!
    if (data.all_states && window.renderBoard) {
      window.state.currentProject.states = data.all_states;
      window.renderBoard(data.all_states);
    }

    if (data.new_extracted_states && data.new_extracted_states.length > 0) {
      window.showToast(`Extracted ${data.new_extracted_states.length} new decision item(s)`, 'success');
    }

  } catch (err) {
    document.getElementById(thinkingId)?.remove();
    console.error('Chat error:', err);
  }
}

// Clear Chat Transcript
async function handleClearChat() {
  if (!window.state.currentProject) return;
  const projectId = window.state.currentProject.project_id;
  try {
    await window.apiFetch('/api/ai/clear', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId })
    });
    window.state.currentProject.chat_history = [];
    renderChatTranscript([]);
    window.showToast('Chat history cleared', 'info');
  } catch (err) {
    console.error(err);
  }
}

// Quick Prompt Clicks
function initQuickPrompts() {
  document.querySelectorAll('.quick-prompt').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('chatInput');
      input.value = btn.textContent;
      input.focus();
    });
  });
}

// Event Listeners Initialization
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('chatForm')?.addEventListener('submit', handleSendChat);
  document.getElementById('btnClearChat')?.addEventListener('click', handleClearChat);
  initQuickPrompts();
});

window.renderChatTranscript = renderChatTranscript;
