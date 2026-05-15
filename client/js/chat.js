// AI 对话模块 — 完整功能版
class ChatModule {
  constructor() {
    this.socket = null;
    this.currentSessionId = null;
    this.messages = []; // 存储所有消息用于导出和虚拟滚动
    this.isGenerating = false;
    this.currentBubbleEl = null;
    this.rawText = '';
    this.renderScheduled = false;
    this.userScrolled = false;

    this.messagesList = document.getElementById('messagesList');
    this.messagesContainer = document.getElementById('messagesContainer');
    this.chatInput = document.getElementById('chatInput');
    this.btnSend = document.getElementById('btnSend');
    this.btnStop = document.getElementById('btnStop');
    this.chatTitle = document.getElementById('chatTitle');
    this.chatMeta = document.getElementById('chatMeta');
    this.sessionList = document.getElementById('sessionList');
    this.modelSelect = document.getElementById('modelSelect');
  }

  init() {
    this.socket = io('/chat', {
      auth: { token: Auth.getToken() },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    this._bindSocketEvents();
    this._bindUIEvents();
    this._bindDragDrop();
    this._bindExport();
    this._loadSessions();
  }

  _bindSocketEvents() {
    this.socket.on('connect', () => console.log('[Chat] Connected'));

    this.socket.on('chat:init', ({ sessionId, model }) => {
      this.currentSessionId = sessionId;
      this.chatMeta.textContent = model;
    });

    this.socket.on('chat:thinking_delta', ({ text }) => {
      this._ensureBubble();
      this.thinkingText = (this.thinkingText || '') + text;
      this._updateThinking(this.thinkingText);
    });

    this.socket.on('chat:text_delta', ({ text }) => {
      this._ensureBubble();
      this.rawText += text;
      this._scheduleRender();
    });

    this.socket.on('chat:tool', ({ name, input }) => {
      this._ensureBubble();
      this._addToolCall(name, input);
    });

    this.socket.on('chat:tool_result', ({ id, content }) => {});

    this.socket.on('chat:done', ({ result, cost, duration, sessionId }) => {
      this.currentSessionId = sessionId;
      // 保存消息用于导出
      this.messages.push({ role: 'assistant', content: this.rawText, cost, duration });
      this._finishGeneration(cost, duration);
      this._loadSessions();
      this._notifyFileChange();
    });

    this.socket.on('chat:error', ({ message }) => {
      this._finishGeneration();
      App.toast(message, 'error');
    });

    this.socket.on('chat:stopped', () => {
      this._finishGeneration();
      App.toast('已停止生成', 'info');
    });

    this.socket.on('disconnect', () => console.log('[Chat] Disconnected'));
  }

  _bindUIEvents() {
    this.btnSend.addEventListener('click', () => this.send());
    this.btnStop.addEventListener('click', () => this.stop());

    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });

    this.chatInput.addEventListener('input', () => {
      this.chatInput.style.height = 'auto';
      this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 150) + 'px';
    });

    this.messagesContainer.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.messagesContainer;
      this.userScrolled = scrollHeight - scrollTop - clientHeight > 50;
    });

    document.getElementById('btnNewChat').addEventListener('click', () => this.newChat());
    document.getElementById('btnToggleSidebar').addEventListener('click', () => {
      document.getElementById('chatSidebar').classList.toggle('hidden');
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isGenerating) this.stop();
    });

    // 点击事件代理 — 文件路径跳转 + 复制按钮
    this.messagesList.addEventListener('click', (e) => {
      const pathLink = e.target.closest('.clickable-path');
      if (pathLink) { e.preventDefault(); this._openFilePath(pathLink.dataset.path); }

      const copyBtn = e.target.closest('.msg-copy-btn');
      if (copyBtn) {
        const msgEl = copyBtn.closest('.message');
        const content = msgEl?.querySelector('.message-content')?.textContent || '';
        navigator.clipboard.writeText(content);
        copyBtn.textContent = '已复制';
        setTimeout(() => copyBtn.textContent = '复制回复', 1500);
      }
    });
  }

  // ===== 拖拽文件支持 =====
  _bindDragDrop() {
    const wrapper = document.getElementById('inputWrapper');
    const overlay = document.getElementById('dropOverlay');

    ['dragenter', 'dragover'].forEach(evt => {
      wrapper.addEventListener(evt, (e) => {
        e.preventDefault();
        overlay.classList.remove('hidden');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      wrapper.addEventListener(evt, () => {
        overlay.classList.add('hidden');
      });
    });

    wrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        // 将文件路径附加到输入框
        const paths = [...files].map(f => f.path || f.name).filter(Boolean);
        if (paths.length > 0) {
          const current = this.chatInput.value;
          const prefix = current ? current + '\n' : '';
          this.chatInput.value = prefix + '附加文件:\n' + paths.map(p => `- ${p}`).join('\n');
          this.chatInput.style.height = 'auto';
          this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 150) + 'px';
          App.toast(`已附加 ${paths.length} 个文件路径`, 'success');
        }
      }
    });
  }

  // ===== 对话导出 =====
  _bindExport() {
    document.getElementById('btnExportChat').addEventListener('click', () => {
      this.exportCurrentChat();
    });
  }

  exportCurrentChat() {
    if (this.messages.length === 0) {
      App.toast('当前没有可导出的消息', 'info');
      return;
    }

    let md = `# CatDesk 对话记录\n\n`;
    md += `- 时间: ${new Date().toLocaleString('zh-CN')}\n`;
    md += `- 工作目录: ${this._getWorkDir()}\n`;
    md += `- 模型: ${this.modelSelect.value || '默认'}\n\n---\n\n`;

    for (const msg of this.messages) {
      if (msg.role === 'user') {
        md += `## 👤 用户\n\n${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        md += `## 🤖 助手\n\n${msg.content}\n\n`;
        if (msg.cost) md += `> ⏱ ${(msg.duration / 1000).toFixed(1)}s · 💰 $${msg.cost.toFixed(4)}\n\n`;
      }
    }

    // 下载为 .md 文件
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `catdesk-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    App.toast('对话已导出为 Markdown', 'success');
  }

  // 获取当前工作目录（从 workspace 模块）
  _getWorkDir() {
    return App.modules.workspace ? App.modules.workspace.getWorkDir() : '';
  }

  async _loadSessions() {
    try {
      const workDir = this._getWorkDir();
      const url = workDir ? `/api/sessions?workDir=${encodeURIComponent(workDir)}` : '/api/sessions';
      const res = await Auth.fetch(url);
      const data = await res.json();
      this._renderSessionList(data.data || []);
    } catch (err) {}
  }

  _renderSessionList(sessions) {
    this.sessionList.innerHTML = sessions.slice(0, 30).map(s => {
      const time = new Date(s.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const isActive = s.sessionId === this.currentSessionId;
      return `
        <div class="session-item ${isActive ? 'active' : ''}" data-session-id="${s.sessionId}">
          <div class="session-item-title">${this._escapeHtml(s.title || '未命名会话')}</div>
          <div class="session-item-meta">${time}</div>
        </div>
      `;
    }).join('');

    this.sessionList.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', () => this._loadSessionHistory(item.dataset.sessionId));
    });
  }

  send() {
    const prompt = this.chatInput.value.trim();
    if (!prompt || this.isGenerating) return;

    this.messages.push({ role: 'user', content: prompt });
    this._addUserMessage(prompt);
    this.chatInput.value = '';
    this.chatInput.style.height = 'auto';
    this._startGeneration();

    const model = this.modelSelect.value || undefined;
    this.socket.emit('chat:send', {
      prompt,
      sessionId: this.currentSessionId,
      workDir: this._getWorkDir(),
      model,
    });
  }

  stop() { this.socket.emit('chat:stop'); }

  newChat() {
    this.currentSessionId = null;
    this.messages = [];
    this.chatTitle.textContent = '新对话';
    this.chatMeta.textContent = '';
    this.messagesList.innerHTML = `
      <div class="welcome-message">
        <div class="welcome-icon">⚡</div>
        <h2>CatDesk Remote</h2>
        <p>输入你的问题，开始远程 AI 对话</p>
        <div class="welcome-tips">
          <span class="tip">支持流式输出</span>
          <span class="tip">代码高亮</span>
          <span class="tip">会话恢复</span>
        </div>
        <div class="shortcut-hints">
          <span class="shortcut-hint"><kbd>⌘K</kbd> 快速切换</span>
          <span class="shortcut-hint"><kbd>⌘N</kbd> 新对话</span>
          <span class="shortcut-hint"><kbd>⌘Enter</kbd> 发送</span>
        </div>
      </div>
    `;
  }

  async _loadSessionHistory(sessionId) {
    this.sessionList.querySelectorAll('.session-item').forEach(el => {
      el.classList.toggle('active', el.dataset.sessionId === sessionId);
    });
    this.currentSessionId = sessionId;
    this.chatTitle.textContent = '加载中...';
    this.messagesList.innerHTML = '<div class="loading-hint">加载历史消息...</div>';

    try {
      const res = await Auth.fetch(`/api/sessions/${sessionId}/messages`);
      const data = await res.json();
      const messages = data.data || [];

      if (messages.length === 0) {
        this.messagesList.innerHTML = '<div class="welcome-message"><p>该会话暂无消息记录</p></div>';
        this.chatTitle.textContent = '空会话';
        return;
      }

      this.messagesList.innerHTML = '';
      this.messages = [];
      let lastCost = null;

      for (const msg of messages) {
        if (msg.role === 'user') {
          this.messages.push({ role: 'user', content: msg.content });
          this._addUserMessage(msg.content);
        } else if (msg.role === 'assistant') {
          this.messages.push({ role: 'assistant', content: msg.content });
          const div = document.createElement('div');
          div.className = 'message message-assistant';
          const rendered = this._renderMarkdownWithPaths(msg.content || '');
          div.innerHTML = `
            <div class="message-header">
              <div class="message-role"><span class="role-dot"></span>ASSISTANT</div>
              <button class="msg-copy-btn">复制回复</button>
            </div>
            <div class="message-content">${rendered}</div>
          `;

          if (msg.tools && msg.tools.length > 0) {
            const contentEl = div.querySelector('.message-content');
            for (const tool of msg.tools) {
              const toolEl = document.createElement('details');
              toolEl.className = 'tool-call';
              toolEl.innerHTML = `<summary>🔧 ${this._escapeHtml(tool.name)}</summary><pre><code>${this._escapeHtml(JSON.stringify(tool.input, null, 2))}</code></pre>`;
              contentEl.appendChild(toolEl);
            }
          }

          this.messagesList.appendChild(div);
          div.querySelectorAll('pre code:not(.hljs)').forEach(block => hljs.highlightElement(block));
        } else if (msg.role === 'system' && msg.type === 'result') {
          lastCost = msg;
        }
      }

      if (lastCost) {
        const metaEl = document.createElement('div');
        metaEl.className = 'message-meta session-meta';
        metaEl.textContent = `💰 总计 $${lastCost.cost.toFixed(4)}`;
        this.messagesList.appendChild(metaEl);
      }

      this.chatTitle.textContent = '历史会话';
      this.chatMeta.textContent = `ID: ${sessionId.slice(0, 8)}...`;
      this._scrollToBottom();
      App.toast('发送新消息将继续此会话', 'info');
    } catch (err) {
      this.messagesList.innerHTML = `<div class="welcome-message"><p>加载失败: ${err.message}</p></div>`;
      this.chatTitle.textContent = '加载失败';
    }
  }

  _addUserMessage(text) {
    const welcome = this.messagesList.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.className = 'message message-user';
    div.innerHTML = `
      <div class="message-role"><span class="role-dot"></span>YOU</div>
      <div class="message-content">${this._escapeHtml(text)}</div>
    `;
    this.messagesList.appendChild(div);
    this._scrollToBottom();
  }

  _ensureBubble() {
    if (this.currentBubbleEl) return;
    const div = document.createElement('div');
    div.className = 'message message-assistant';
    div.innerHTML = `
      <div class="message-header">
        <div class="message-role"><span class="role-dot"></span>ASSISTANT</div>
        <button class="msg-copy-btn">复制回复</button>
      </div>
      <div class="message-content"></div>
    `;
    this.messagesList.appendChild(div);
    this.currentBubbleEl = div;
    this.rawText = '';
    this.thinkingText = '';
  }

  _scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => { this._doRender(); this.renderScheduled = false; });
  }

  _doRender() {
    if (!this.currentBubbleEl) return;
    const contentEl = this.currentBubbleEl.querySelector('.message-content');
    const html = this._renderMarkdownWithPaths(this.rawText);
    contentEl.innerHTML = html;

    // 代码块：添加语言标签 + 复制按钮
    contentEl.querySelectorAll('pre:not(.has-lang)').forEach(pre => {
      pre.classList.add('has-lang');
      const codeEl = pre.querySelector('code');
      if (codeEl) {
        // 检测语言
        const langClass = [...codeEl.classList].find(c => c.startsWith('language-'));
        const lang = langClass ? langClass.replace('language-', '') : '';
        if (!codeEl.classList.contains('hljs')) hljs.highlightElement(codeEl);
        // 从 hljs 结果推断语言
        const detectedLang = lang || codeEl.dataset?.language || codeEl.className.match(/language-(\w+)/)?.[1] || '';
        if (detectedLang) {
          const labelEl = document.createElement('span');
          labelEl.className = 'code-lang-label';
          labelEl.textContent = detectedLang;
          pre.appendChild(labelEl);
        }
      }
      // 复制按钮
      if (!pre.querySelector('.code-copy-btn')) {
        const btn = document.createElement('button');
        btn.className = 'code-copy-btn';
        btn.textContent = '复制';
        btn.onclick = () => {
          const code = pre.querySelector('code')?.textContent || '';
          navigator.clipboard.writeText(code);
          btn.textContent = '已复制';
          setTimeout(() => btn.textContent = '复制', 1500);
        };
        pre.appendChild(btn);
      }
    });

    if (!this.userScrolled) this._scrollToBottom();
  }

  _renderMarkdownWithPaths(text) {
    const html = DOMPurify.sanitize(marked.parse(text));
    const pathRegex = /(?<!["`'])(\/(Users|home|tmp|var|etc|opt)[^\s<>"'`\)]*\.\w+)(?!["`'])/g;
    return html.replace(pathRegex, (match, path) => {
      return `<a class="clickable-path" data-path="${this._escapeHtml(path)}" title="点击在文件浏览器中打开">${this._escapeHtml(path)}</a>`;
    });
  }

  _updateThinking(text) {
    if (!this.currentBubbleEl) return;
    let thinkingEl = this.currentBubbleEl.querySelector('.thinking-block');
    if (!thinkingEl) {
      thinkingEl = document.createElement('details');
      thinkingEl.className = 'thinking-block';
      thinkingEl.innerHTML = '<summary>💭 思考过程</summary><pre class="thinking-content"></pre>';
      const contentEl = this.currentBubbleEl.querySelector('.message-content');
      this.currentBubbleEl.insertBefore(thinkingEl, contentEl);
    }
    thinkingEl.querySelector('.thinking-content').textContent = text;
  }

  _addToolCall(name, input) {
    if (!this.currentBubbleEl) return;
    const contentEl = this.currentBubbleEl.querySelector('.message-content');
    const toolEl = document.createElement('details');
    toolEl.className = 'tool-call';
    toolEl.innerHTML = `<summary>🔧 ${this._escapeHtml(name)}</summary><pre><code>${this._escapeHtml(JSON.stringify(input, null, 2))}</code></pre>`;
    contentEl.appendChild(toolEl);
  }

  _startGeneration() {
    this.isGenerating = true;
    this.btnSend.classList.add('hidden');
    this.btnStop.classList.remove('hidden');
    this.chatInput.disabled = true;
  }

  _finishGeneration(cost, duration) {
    this.isGenerating = false;
    this.btnStop.classList.add('hidden');
    this.btnSend.classList.remove('hidden');
    this.chatInput.disabled = false;
    this.chatInput.focus();

    if (this.currentBubbleEl && cost !== undefined) {
      const metaEl = document.createElement('div');
      metaEl.className = 'message-meta';
      metaEl.textContent = `⏱ ${(duration / 1000).toFixed(1)}s · 💰 $${cost.toFixed(4)}`;
      this.currentBubbleEl.appendChild(metaEl);
    }
    this.currentBubbleEl = null;
    this._doRender();
  }

  _notifyFileChange() {
    if (App.currentView === 'files') {
      App.modules.files.loadDirectory(App.modules.files.currentPath);
    } else {
      App.modules.files._needsRefresh = true;
    }
  }

  _openFilePath(filePath) {
    const isFile = /\.\w+$/.test(filePath);
    if (isFile) {
      const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));
      App.switchView('files');
      App.modules.files.loadDirectory(dirPath).then(() => {
        setTimeout(() => {
          App.modules.files.loadFile(filePath);
          document.querySelectorAll('.file-item').forEach(el => {
            el.classList.toggle('active', el.dataset.path === filePath);
          });
        }, 300);
      });
    } else {
      App.switchView('files');
      App.modules.files.loadDirectory(filePath);
    }
    App.toast(`已跳转到: ${filePath.split('/').pop()}`, 'info');
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    });
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
