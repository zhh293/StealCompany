// 远程终端模块
class TerminalModule {
  constructor() {
    this.socket = null;
    this.terminals = new Map(); // id → { term, fitAddon, tabEl }
    this.activeTerminalId = null;
    this.tabsContainer = document.getElementById('terminalTabs');
    this.container = document.getElementById('terminalContainer');
    this.counter = 0;
  }

  init() {
    this.socket = io('/terminal', { auth: { token: Auth.getToken() } });
    this._bindSocketEvents();
    this._bindUIEvents();
  }

  _bindSocketEvents() {
    this.socket.on('terminal:created', ({ id }) => {
      this._onTerminalCreated(id);
    });

    this.socket.on('terminal:output', ({ id, data }) => {
      const entry = this.terminals.get(id);
      if (entry) entry.term.write(data);
    });

    // 命令执行完毕后通知文件浏览器可能有变化
    this.socket.on('terminal:cmd_done', ({ id, cmd }) => {
      this._onCommandDone(cmd);
    });

    this.socket.on('terminal:exit', ({ id, code, reason }) => {
      const entry = this.terminals.get(id);
      if (entry) {
        const msg = reason === 'idle_timeout' ? '\r\n[终端因空闲超时已关闭]' : `\r\n[进程退出: ${code}]`;
        entry.term.writeln(msg);
      }
    });

    this.socket.on('terminal:error', ({ message }) => {
      App.toast(message, 'error');
    });
  }

  _bindUIEvents() {
    document.getElementById('btnNewTerminal').addEventListener('click', () => {
      this.createTerminal();
    });
  }

  createTerminal(cwd) {
    this.counter++;
    const term = new window.Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#e0e0e8',
        cursor: '#7c5cfc',
        cursorAccent: '#0a0a0f',
        selectionBackground: 'rgba(124, 92, 252, 0.3)',
        black: '#1a1a2e',
        red: '#f87171',
        green: '#34d399',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#a78bfa',
        cyan: '#22d3ee',
        white: '#e0e0e8',
        brightBlack: '#4a4a6a',
        brightRed: '#fca5a5',
        brightGreen: '#6ee7b7',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#c4b5fd',
        brightCyan: '#67e8f9',
        brightWhite: '#f8f8ff',
      },
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', Menlo, monospace",
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    // 创建终端 DOM
    const termDiv = document.createElement('div');
    termDiv.className = 'terminal-instance';
    termDiv.style.cssText = 'width:100%;height:100%;display:none;';
    this.container.appendChild(termDiv);
    term.open(termDiv);

    // 延迟 fit 确保 DOM 已渲染
    setTimeout(() => fitAddon.fit(), 50);

    const { cols, rows } = term;
    this.socket.emit('terminal:create', { cols, rows, cwd: cwd || undefined });

    // 暂存，等待 created 事件
    this._pendingTerm = { term, fitAddon, termDiv };
  }

  _onTerminalCreated(id) {
    if (!this._pendingTerm) return;
    const { term, fitAddon, termDiv } = this._pendingTerm;
    this._pendingTerm = null;

    // 创建 tab
    const tabEl = document.createElement('button');
    tabEl.className = 'terminal-tab';
    tabEl.innerHTML = `Terminal ${this.counter} <span class="terminal-tab-close">×</span>`;
    tabEl.dataset.id = id;
    this.tabsContainer.appendChild(tabEl);

    // Tab 点击切换
    tabEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('terminal-tab-close')) {
        this.closeTerminal(id);
      } else {
        this.switchToTerminal(id);
      }
    });

    // 输入
    term.onData((data) => {
      this.socket.emit('terminal:input', { id, data });
    });

    // resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      this.socket.emit('terminal:resize', { id, cols: term.cols, rows: term.rows });
    });
    resizeObserver.observe(termDiv);

    this.terminals.set(id, { term, fitAddon, termDiv, tabEl, resizeObserver });
    this.switchToTerminal(id);
  }

  switchToTerminal(id) {
    // 隐藏所有
    for (const [tid, entry] of this.terminals) {
      entry.termDiv.style.display = 'none';
      entry.tabEl.classList.remove('active');
    }

    const entry = this.terminals.get(id);
    if (entry) {
      entry.termDiv.style.display = 'block';
      entry.tabEl.classList.add('active');
      entry.fitAddon.fit();
      entry.term.focus();
      this.activeTerminalId = id;
    }
  }

  closeTerminal(id) {
    const entry = this.terminals.get(id);
    if (!entry) return;

    this.socket.emit('terminal:close', { id });
    entry.resizeObserver.disconnect();
    entry.term.dispose();
    entry.termDiv.remove();
    entry.tabEl.remove();
    this.terminals.delete(id);

    // 切换到另一个终端
    if (this.activeTerminalId === id) {
      const remaining = [...this.terminals.keys()];
      if (remaining.length > 0) {
        this.switchToTerminal(remaining[remaining.length - 1]);
      } else {
        this.activeTerminalId = null;
      }
    }
  }

  // 命令执行完毕的回调 — 操作连贯性
  _onCommandDone(cmd) {
    // 判断是否可能影响文件系统的命令
    const fileOps = ['touch', 'mkdir', 'rm', 'mv', 'cp', 'git', 'npm', 'yarn', 'pnpm', 'wget', 'curl', 'unzip', 'tar',
      'del', 'move', 'copy', 'ren', 'xcopy', 'robocopy', 'rd', 'md', 'erase'];
    const isFileOp = fileOps.some(op => cmd.startsWith(op + ' ') || cmd === op);

    if (isFileOp) {
      // 如果文件浏览器当前可见，直接刷新
      if (App.currentView === 'files') {
        App.modules.files.loadDirectory(App.modules.files.currentPath);
        App.toast('文件列表已刷新', 'info');
      } else {
        // 标记需要刷新，并显示一个可操作的提示
        App.modules.files._needsRefresh = true;
        this._showFileRefreshHint();
      }
    }
  }

  _showFileRefreshHint() {
    // 在终端顶部显示一个可点击的提示条
    const existing = document.querySelector('.file-refresh-hint');
    if (existing) return; // 避免重复

    const hint = document.createElement('div');
    hint.className = 'file-refresh-hint';
    hint.innerHTML = `
      <span>📁 文件可能已变更</span>
      <button class="hint-action" id="hintGoFiles">查看文件</button>
      <button class="hint-dismiss">×</button>
    `;
    document.getElementById('view-terminal').prepend(hint);

    hint.querySelector('#hintGoFiles').addEventListener('click', () => {
      App.switchView('files');
      hint.remove();
    });
    hint.querySelector('.hint-dismiss').addEventListener('click', () => {
      hint.remove();
    });

    // 10秒后自动消失
    setTimeout(() => hint.remove(), 10000);
  }

  // 工作区切换时 cd 到新目录
  cdToWorkspace(dirPath) {
    if (!dirPath || !this.activeTerminalId) return;
    const isWinPath = /^[A-Z]:\\/i.test(dirPath);
    const cdCmd = isWinPath ? `cd "${dirPath}"` : `cd ${dirPath.replace(/ /g, '\\ ')}`;
    this.socket.emit('terminal:input', {
      id: this.activeTerminalId,
      data: cdCmd + '\r',
    });
  }

  // 当终端视图变为可见时调用
  onShow() {
    if (this.socket && !this.socket.connected) {
      // 还没连上，等连上再创建
      return;
    }
    if (this.terminals.size === 0) {
      this.createTerminal();
    } else if (this.activeTerminalId) {
      const entry = this.terminals.get(this.activeTerminalId);
      if (entry) {
        entry.fitAddon.fit();
        entry.term.focus();
      }
    }
  }
}
