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

  // 当终端视图变为可见时调用
  onShow() {
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
