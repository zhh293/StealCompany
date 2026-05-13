// AI 对话模块
class ChatModule {
  constructor() {
    this.socket = null;
    this.currentSessionId = null;
    this.messages = [];
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
    this.workDirSelect = document.getElementById('workDirSelect');
    this.modelSelect = document.getElementById('modelSelect');
  }

  init() {
    this.socket = io('/chat', { auth: { token: Auth.getToken() } });
    this._bindSocketEvents();
    this._bindUIEvents();
    this._loadWorkDirs();
    this._loadSessions();
  }

  _bindSocketEvents() {
    this.socket.on('connect', () => {
      console.log('[Chat] Connected');
    });

    this.socket.on('chat:init', ({ sessionId, model }) => {
      this.currentSessionId = sessionId;
      this.chatMeta.textContent = model;
    });

    this.socket.on('chat:thinking', ({ text }) => {
      this._ensureBubble();
      this._updateThinking(text);
    });

    this.socket.on('chat:text', ({ text }) => {
      this._ensureBubble();
      this.rawText += text;
      this._scheduleRender();
    });

    this.socket.on('chat:tool', ({ name, input }) => {
      this._ensureBubble();
      this._addToolCall(name, input);
    });

    this.socket.on('chat:tool_result', ({ id, content }) => {
      // 可选：显示工具结果
    });

    this.socket.on('chat:done', ({ result, cost, duration, sessionId }) => {
      this.currentSessionId = sessionId;
      this._finishGeneration(cost, duration);
      this._loadSessions();
    });

    this.socket.on('chat:error', ({ message }) => {
      this._finishGeneration();
      App.toast(message, 'error');
    });

    this.socket.on('chat:stopped', () => {
      this._finishGeneration();
      App.toast('已停止生成', 'info');
    });

    this.socket.on('disconnect', () => {
      console.log('[Chat] Disconnected');
    });
  }

  _bindUIEvents() {
    // 发送
    this.btnSend.addEventListener('click', () => this.send());
    this.btnStop.addEventListener('click', () => this.stop());

    // 输入框
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });

    // 自动调整输入框高度
    this.chatInput.addEventListener('input', () => {
      this.chatInput.style.height = 'auto';
      this.chatInput.style.height = Math.min(this.chatInput.scrollHeight, 150) + 'px';
    });

    // 监听用户滚动
    this.messagesContainer.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = this.messagesContainer;
      this.userScrolled = scrollHeight - scrollTop - clientHeight > 50;
    });

    // 新建会话
    document.getElementById('btnNewChat').addEventListener('click', () => {
      this.newChat();
    });

    // 侧边栏切换
    document.getElementById('btnToggleSidebar').addEventListener('click', () => {
      document.getElementById('chatSidebar').classList.toggle('hidden');
    });

    // 快捷键
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isGenerating) {
        this.stop();
      }
    });
  }

  async _loadWorkDirs() {
    try {
      const res = await Auth.fetch('/api/settings/workspace-dirs');
      const data = await res.json();
      const dirs = data.data.allowedDirs || [];
      this.workDirSelect.innerHTML = dirs.map(d =>
        `<option value="${d}" ${d === data.data.defaultWorkspace ? 'selected' : ''}>${d.replace(/.*\//, '~/')}</option>`
      ).join('');
    } catch (err) {
      this.workDirSelect.innerHTML = `<option value="${'/Users/zhanghonghao/Desktop'}">/Users/zhanghonghao/Desktop</option>`;
    }
  }

  async _loadSessions() {
    try {
      const res = await Auth.fetch('/api/sessions');
      const data = await res.json();
      const sessions = data.data || [];
      this._renderSessionList(sessions);
    } catch (err) {
      // 静默失败
    }
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

    // 绑定点击事件
    this.sessionList.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', () => {
        const sessionId = item.dataset.sessionId;
        this._loadSessionHistory(sessionId);
      });
    });
  }

  send() {
    const prompt = this.chatInput.value.trim();
    if (!prompt || this.isGenerating) return;

    // 显示用户消息
    this._addUserMessage(prompt);

    // 清空输入
    this.chatInput.value = '';
    this.chatInput.style.height = 'auto';

    // 进入生成状态
    this._startGeneration();

    // 发送到后端
    const model = this.modelSelect.value || undefined;
    this.socket.emit('chat:send', {
      prompt,
      sessionId: this.currentSessionId,
      workDir: this.workDirSelect.value,
      model,
    });
  }

  stop() {
    this.socket.emit('chat:stop');
  }

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
      </div>
    `;
  }

  resumeSession(sessionId) {
    this.currentSessionId = sessionId;
    this.chatTitle.textContent = '已恢复会话';
    App.toast('会话已恢复，发送消息继续对话', 'success');
  }

  async _loadSessionHistory(sessionId) {
    // 高亮选中的会话项
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

      // 渲染历史消息
      this.messagesList.innerHTML = '';
      let lastCost = null;

      for (const msg of messages) {
        if (msg.role === 'user') {
          this._addUserMessage(msg.content);
        } else if (msg.role === 'assistant') {
          const div = document.createElement('div');
          div.className = 'message message-assistant';
          const html = DOMPurify.sanitize(marked.parse(msg.content || ''));
          div.innerHTML = `
            <div class="message-role"><span class="role-dot"></span>ASSISTANT</div>
            <div class="message-content">${html}</div>
          `;

          // 显示工具调用
          if (msg.tools && msg.tools.length > 0) {
            const contentEl = div.querySelector('.message-content');
            for (const tool of msg.tools) {
              const toolEl = document.createElement('details');
              toolEl.className = 'tool-call';
              toolEl.innerHTML = `
                <summary>🔧 ${this._escapeHtml(tool.name)}</summary>
                <pre><code>${this._escapeHtml(JSON.stringify(tool.input, null, 2))}</code></pre>
              `;
              contentEl.appendChild(toolEl);
            }
          }

          this.messagesList.appendChild(div);

          // 代码高亮
          div.querySelectorAll('pre code:not(.hljs)').forEach(block => {
            hljs.highlightElement(block);
          });
        } else if (msg.role === 'system' && msg.type === 'result') {
          lastCost = msg;
        }
      }

      // 在最后添加费用信息
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
    // 移除欢迎消息
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
      <div class="message-role"><span class="role-dot"></span>ASSISTANT</div>
      <div class="message-content"></div>
    `;
    this.messagesList.appendChild(div);
    this.currentBubbleEl = div;
    this.rawText = '';
  }

  _scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this._doRender();
      this.renderScheduled = false;
    });
  }

  _doRender() {
    if (!this.currentBubbleEl) return;
    const contentEl = this.currentBubbleEl.querySelector('.message-content');

    // 使用 marked 渲染 Markdown，DOMPurify 消毒
    const html = DOMPurify.sanitize(marked.parse(this.rawText));
    contentEl.innerHTML = html;

    // 代码高亮
    contentEl.querySelectorAll('pre code:not(.hljs)').forEach(block => {
      hljs.highlightElement(block);
    });

    // 添加复制按钮
    contentEl.querySelectorAll('pre:not(.has-copy)').forEach(pre => {
      pre.classList.add('has-copy');
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
    });

    if (!this.userScrolled) {
      this._scrollToBottom();
    }
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
    toolEl.innerHTML = `
      <summary>🔧 ${this._escapeHtml(name)}</summary>
      <pre><code>${this._escapeHtml(JSON.stringify(input, null, 2))}</code></pre>
    `;
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

    // 添加元信息
    if (this.currentBubbleEl && cost !== undefined) {
      const metaEl = document.createElement('div');
      metaEl.className = 'message-meta';
      metaEl.textContent = `⏱ ${(duration / 1000).toFixed(1)}s · 💰 $${cost.toFixed(4)}`;
      this.currentBubbleEl.appendChild(metaEl);
    }

    this.currentBubbleEl = null;
    this._doRender(); // 最终渲染
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
