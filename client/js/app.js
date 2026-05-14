// 主应用 - 路由与导航、快捷键、状态感知
const App = {
  currentView: 'chat',
  modules: {},
  connectionState: 'connecting', // connecting | connected | disconnected | reconnecting

  init() {
    // 初始化各模块
    this.modules.chat = new ChatModule();
    this.modules.terminal = new TerminalModule();
    this.modules.files = new FilesModule();
    this.modules.dashboard = new DashboardModule();

    // 启动模块
    this.modules.chat.init();
    this.modules.terminal.init();
    this.modules.files.init();
    this.modules.dashboard.init();

    // 绑定导航
    this._bindNavigation();

    // 绑定顶部功能
    this._bindTopBar();

    // 绑定全局快捷键
    this._bindShortcuts();

    // 初始化连接状态指示器
    this._initConnectionStatus();

    // 初始化会话搜索
    this._initSessionSearch();

    // 默认视图
    this.switchView('chat');

    console.log('[App] CatDesk Remote Console initialized');
  },

  _bindNavigation() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchView(btn.dataset.view);
      });
    });
  },

  _bindTopBar() {
    // 退出登录
    document.getElementById('btnLogout').addEventListener('click', () => {
      Auth.logout();
    });
  },

  // ===== 全局快捷键 =====
  _bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl + K: 快速切换面板（弹出面板选择器）
      if (isMeta && e.key === 'k') {
        e.preventDefault();
        this._showQuickSwitcher();
        return;
      }

      // Cmd/Ctrl + N: 新建对话
      if (isMeta && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        if (this.currentView === 'chat') {
          this.modules.chat.newChat();
        } else {
          this.switchView('chat');
          this.modules.chat.newChat();
        }
        return;
      }

      // Cmd/Ctrl + Enter: 发送消息（在对话视图）
      if (isMeta && e.key === 'Enter') {
        e.preventDefault();
        if (this.currentView === 'chat') {
          this.modules.chat.send();
        }
        return;
      }

      // Cmd/Ctrl + 1/2/3/4: 快速切换面板
      if (isMeta && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const views = ['chat', 'terminal', 'files', 'dashboard'];
        this.switchView(views[parseInt(e.key) - 1]);
        return;
      }

      // Cmd/Ctrl + T: 新建终端
      if (isMeta && e.key === 't' && !e.shiftKey) {
        e.preventDefault();
        this.switchView('terminal');
        this.modules.terminal.createTerminal();
        return;
      }

      // Cmd/Ctrl + L: 聚焦输入框
      if (isMeta && e.key === 'l') {
        e.preventDefault();
        if (this.currentView === 'chat') {
          document.getElementById('chatInput').focus();
        }
        return;
      }

      // Escape: 关闭快速切换器或停止生成
      if (e.key === 'Escape') {
        const switcher = document.getElementById('quickSwitcher');
        if (switcher && !switcher.classList.contains('hidden')) {
          this._hideQuickSwitcher();
          return;
        }
      }
    });
  },

  // ===== 快速切换器 (Cmd+K) =====
  _showQuickSwitcher() {
    let switcher = document.getElementById('quickSwitcher');
    if (!switcher) {
      switcher = document.createElement('div');
      switcher.id = 'quickSwitcher';
      switcher.className = 'quick-switcher';
      switcher.innerHTML = `
        <div class="quick-switcher-overlay"></div>
        <div class="quick-switcher-panel">
          <input type="text" class="quick-switcher-input" placeholder="切换面板... (输入面板名称)" autofocus>
          <div class="quick-switcher-list">
            <div class="quick-switcher-item" data-view="chat" data-keywords="对话 chat ai">
              <span class="qs-icon">💬</span>
              <span class="qs-label">AI 对话</span>
              <kbd class="qs-shortcut">⌘1</kbd>
            </div>
            <div class="quick-switcher-item" data-view="terminal" data-keywords="终端 terminal shell">
              <span class="qs-icon">⚡</span>
              <span class="qs-label">终端</span>
              <kbd class="qs-shortcut">⌘2</kbd>
            </div>
            <div class="quick-switcher-item" data-view="files" data-keywords="文件 files browser">
              <span class="qs-icon">📁</span>
              <span class="qs-label">文件浏览</span>
              <kbd class="qs-shortcut">⌘3</kbd>
            </div>
            <div class="quick-switcher-item" data-view="dashboard" data-keywords="状态 dashboard system">
              <span class="qs-icon">📊</span>
              <span class="qs-label">系统状态</span>
              <kbd class="qs-shortcut">⌘4</kbd>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(switcher);

      // 绑定事件
      const overlay = switcher.querySelector('.quick-switcher-overlay');
      overlay.addEventListener('click', () => this._hideQuickSwitcher());

      const input = switcher.querySelector('.quick-switcher-input');
      input.addEventListener('input', (e) => this._filterQuickSwitcher(e.target.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this._hideQuickSwitcher();
        } else if (e.key === 'Enter') {
          const active = switcher.querySelector('.quick-switcher-item.highlighted') ||
                         switcher.querySelector('.quick-switcher-item:not(.hidden)');
          if (active) {
            this.switchView(active.dataset.view);
            this._hideQuickSwitcher();
          }
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          this._navigateQuickSwitcher(e.key === 'ArrowDown' ? 1 : -1);
        }
      });

      switcher.querySelectorAll('.quick-switcher-item').forEach(item => {
        item.addEventListener('click', () => {
          this.switchView(item.dataset.view);
          this._hideQuickSwitcher();
        });
      });
    }

    switcher.classList.remove('hidden');
    const input = switcher.querySelector('.quick-switcher-input');
    input.value = '';
    input.focus();
    this._filterQuickSwitcher('');
  },

  _hideQuickSwitcher() {
    const switcher = document.getElementById('quickSwitcher');
    if (switcher) switcher.classList.add('hidden');
  },

  _filterQuickSwitcher(query) {
    const items = document.querySelectorAll('.quick-switcher-item');
    const q = query.toLowerCase();
    let firstVisible = null;

    items.forEach(item => {
      const keywords = item.dataset.keywords || '';
      const label = item.querySelector('.qs-label').textContent;
      const match = !q || keywords.includes(q) || label.toLowerCase().includes(q);
      item.classList.toggle('hidden', !match);
      item.classList.remove('highlighted');
      if (match && !firstVisible) firstVisible = item;
    });

    if (firstVisible) firstVisible.classList.add('highlighted');
  },

  _navigateQuickSwitcher(direction) {
    const items = [...document.querySelectorAll('.quick-switcher-item:not(.hidden)')];
    if (items.length === 0) return;

    const current = items.findIndex(i => i.classList.contains('highlighted'));
    items.forEach(i => i.classList.remove('highlighted'));

    let next = current + direction;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    items[next].classList.add('highlighted');
  },

  // ===== 连接状态指示器 =====
  _initConnectionStatus() {
    // 创建连接状态 DOM
    const statusEl = document.createElement('div');
    statusEl.id = 'connectionStatus';
    statusEl.className = 'connection-status';
    statusEl.innerHTML = `
      <span class="conn-dot"></span>
      <span class="conn-text">连接中</span>
    `;
    // 插入到 sidebar-bottom 上方
    const sidebarBottom = document.querySelector('.sidebar-bottom');
    sidebarBottom.parentNode.insertBefore(statusEl, sidebarBottom);

    // 监听 chat socket 连接状态（主 socket）
    this._watchConnection();
  },

  _watchConnection() {
    // 延迟等 chat 模块 init 完毕
    setTimeout(() => {
      const socket = this.modules.chat.socket;
      if (!socket) return;

      socket.on('connect', () => {
        this._setConnectionState('connected');
      });

      socket.on('disconnect', () => {
        this._setConnectionState('disconnected');
      });

      socket.io.on('reconnect_attempt', () => {
        this._setConnectionState('reconnecting');
      });

      socket.io.on('reconnect', () => {
        this._setConnectionState('connected');
      });

      socket.io.on('reconnect_failed', () => {
        this._setConnectionState('disconnected');
      });

      // 设置初始状态
      if (socket.connected) {
        this._setConnectionState('connected');
      }
    }, 100);
  },

  _setConnectionState(state) {
    this.connectionState = state;
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;

    const dot = statusEl.querySelector('.conn-dot');
    const text = statusEl.querySelector('.conn-text');

    statusEl.className = `connection-status conn-${state}`;

    const labels = {
      connecting: '连接中',
      connected: '已连接',
      disconnected: '已断开',
      reconnecting: '重连中...',
    };
    text.textContent = labels[state] || state;

    // 断开时 toast 提示
    if (state === 'disconnected') {
      this.toast('与服务器连接已断开', 'error');
    } else if (state === 'connected' && this._wasDisconnected) {
      this.toast('已重新连接', 'success');
    }
    this._wasDisconnected = (state === 'disconnected' || state === 'reconnecting');
  },

  // ===== 会话搜索 =====
  _initSessionSearch() {
    const header = document.querySelector('.chat-sidebar-header');
    if (!header) return;

    // 在会话列表头部添加搜索框
    const searchEl = document.createElement('div');
    searchEl.className = 'session-search';
    searchEl.innerHTML = `
      <input type="text" id="sessionSearch" class="session-search-input" placeholder="搜索会话...">
    `;
    header.after(searchEl);

    const searchInput = document.getElementById('sessionSearch');
    searchInput.addEventListener('input', (e) => {
      this._filterSessions(e.target.value);
    });

    // Cmd+F 在对话视图聚焦搜索
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f' && this.currentView === 'chat') {
        e.preventDefault();
        searchInput.focus();
      }
    });
  },

  _filterSessions(query) {
    const items = document.querySelectorAll('.session-item');
    const q = query.toLowerCase();
    items.forEach(item => {
      const title = item.querySelector('.session-item-title')?.textContent || '';
      const match = !q || title.toLowerCase().includes(q);
      item.style.display = match ? '' : 'none';
    });
  },

  switchView(viewName) {
    this.currentView = viewName;

    // 更新导航高亮
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // 切换面板（HTML 中的 class 是 .view）
    document.querySelectorAll('.view').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });

    // 触发模块 onShow
    switch (viewName) {
      case 'terminal':
        this.modules.terminal.onShow();
        break;
      case 'files':
        this.modules.files.onShow();
        break;
      case 'dashboard':
        this.modules.dashboard.onShow();
        break;
    }
  },

  // 全局 Toast 通知
  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer') || this._createToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  _createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:10000;display:flex;flex-direction:column;gap:8px;';
    document.body.appendChild(container);
    return container;
  },
};

// 页面加载完毕后启动
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
