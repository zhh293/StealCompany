// 主应用 - 路由、导航、快捷键、状态感知、主题切换、手势
const App = {
  currentView: 'chat',
  modules: {},
  connectionState: 'connecting',
  theme: 'dark',

  init() {
    // 恢复主题
    this.theme = localStorage.getItem('catdesk-theme') || 'dark';
    this._applyTheme(this.theme);

    // 初始化各模块
    this.modules.workspace = new WorkspaceModule();
    this.modules.chat = new ChatModule();
    this.modules.terminal = new TerminalModule();
    this.modules.files = new FilesModule();
    this.modules.dashboard = new DashboardModule();

    // 启动模块（workspace 先初始化）
    this.modules.workspace.init();
    this.modules.chat.init();
    this.modules.terminal.init();
    this.modules.files.init();
    this.modules.dashboard.init();

    // 绑定导航
    this._bindNavigation();
    this._bindTopBar();
    this._bindShortcuts();
    this._initConnectionStatus();
    this._initSessionSearch();
    this._initMobileGestures();

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
    document.getElementById('btnLogout').addEventListener('click', () => {
      Auth.logout();
    });

    // 主题切换
    document.getElementById('btnThemeToggle').addEventListener('click', () => {
      this.toggleTheme();
    });
  },

  // ===== 主题系统 =====
  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('catdesk-theme', this.theme);
    this._applyTheme(this.theme);
  },

  _applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // 切换 hljs 主题
    const darkLink = document.getElementById('hljs-theme-dark');
    const lightLink = document.getElementById('hljs-theme-light');
    if (darkLink && lightLink) {
      darkLink.disabled = (theme === 'light');
      lightLink.disabled = (theme === 'dark');
    }
    // 更新图标
    const icon = document.getElementById('themeIcon');
    if (icon) {
      if (theme === 'light') {
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
      } else {
        icon.innerHTML = '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
      }
    }
  },

  // ===== 全局快捷键 =====
  _bindShortcuts() {
    document.addEventListener('keydown', (e) => {
      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.key === 'k') {
        e.preventDefault();
        this._showQuickSwitcher();
        return;
      }

      if (isMeta && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        this.switchView('chat');
        this.modules.chat.newChat();
        return;
      }

      if (isMeta && e.key === 'Enter') {
        e.preventDefault();
        if (this.currentView === 'chat') this.modules.chat.send();
        return;
      }

      if (isMeta && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const views = ['chat', 'terminal', 'files', 'dashboard'];
        this.switchView(views[parseInt(e.key) - 1]);
        return;
      }

      if (isMeta && e.key === 't' && !e.shiftKey) {
        e.preventDefault();
        this.switchView('terminal');
        this.modules.terminal.createTerminal();
        return;
      }

      if (isMeta && e.key === 'l') {
        e.preventDefault();
        if (this.currentView === 'chat') document.getElementById('chatInput').focus();
        return;
      }

      if (e.key === 'Escape') {
        const switcher = document.getElementById('quickSwitcher');
        if (switcher && !switcher.classList.contains('hidden')) {
          this._hideQuickSwitcher();
          return;
        }
        // 关闭右键菜单
        const ctx = document.getElementById('contextMenu');
        if (ctx && !ctx.classList.contains('hidden')) {
          ctx.classList.add('hidden');
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
          <input type="text" class="quick-switcher-input" placeholder="切换面板... (输入名称筛选)" autofocus>
          <div class="quick-switcher-list">
            <div class="quick-switcher-item" data-view="chat" data-keywords="对话 chat ai">
              <span class="qs-icon">💬</span><span class="qs-label">AI 对话</span><kbd class="qs-shortcut">⌘1</kbd>
            </div>
            <div class="quick-switcher-item" data-view="terminal" data-keywords="终端 terminal shell">
              <span class="qs-icon">⚡</span><span class="qs-label">终端</span><kbd class="qs-shortcut">⌘2</kbd>
            </div>
            <div class="quick-switcher-item" data-view="files" data-keywords="文件 files browser">
              <span class="qs-icon">📁</span><span class="qs-label">文件浏览</span><kbd class="qs-shortcut">⌘3</kbd>
            </div>
            <div class="quick-switcher-item" data-view="dashboard" data-keywords="状态 dashboard system 统计">
              <span class="qs-icon">📊</span><span class="qs-label">系统状态</span><kbd class="qs-shortcut">⌘4</kbd>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(switcher);

      switcher.querySelector('.quick-switcher-overlay').addEventListener('click', () => this._hideQuickSwitcher());

      const input = switcher.querySelector('.quick-switcher-input');
      input.addEventListener('input', (e) => this._filterQuickSwitcher(e.target.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this._hideQuickSwitcher();
        else if (e.key === 'Enter') {
          const active = switcher.querySelector('.quick-switcher-item.highlighted') ||
                         switcher.querySelector('.quick-switcher-item:not(.hidden)');
          if (active) { this.switchView(active.dataset.view); this._hideQuickSwitcher(); }
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          this._navigateQuickSwitcher(e.key === 'ArrowDown' ? 1 : -1);
        }
      });

      switcher.querySelectorAll('.quick-switcher-item').forEach(item => {
        item.addEventListener('click', () => { this.switchView(item.dataset.view); this._hideQuickSwitcher(); });
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
    if (!items.length) return;
    const current = items.findIndex(i => i.classList.contains('highlighted'));
    items.forEach(i => i.classList.remove('highlighted'));
    let next = current + direction;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    items[next].classList.add('highlighted');
  },

  // ===== 连接状态 =====
  _initConnectionStatus() {
    const statusEl = document.createElement('div');
    statusEl.id = 'connectionStatus';
    statusEl.className = 'connection-status';
    statusEl.innerHTML = `<span class="conn-dot"></span><span class="conn-text">连接中</span>`;
    const sidebarBottom = document.querySelector('.sidebar-bottom');
    sidebarBottom.parentNode.insertBefore(statusEl, sidebarBottom);
    this._watchConnection();
  },

  _watchConnection() {
    setTimeout(() => {
      const socket = this.modules.chat.socket;
      if (!socket) return;
      socket.on('connect', () => this._setConnectionState('connected'));
      socket.on('disconnect', () => this._setConnectionState('disconnected'));
      socket.io.on('reconnect_attempt', () => this._setConnectionState('reconnecting'));
      socket.io.on('reconnect', () => this._setConnectionState('connected'));
      socket.io.on('reconnect_failed', () => this._setConnectionState('disconnected'));
      if (socket.connected) this._setConnectionState('connected');
    }, 100);
  },

  _setConnectionState(state) {
    this.connectionState = state;
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;
    const text = statusEl.querySelector('.conn-text');
    statusEl.className = `connection-status conn-${state}`;
    const labels = { connecting: '连接中', connected: '已连接', disconnected: '已断开', reconnecting: '重连中...' };
    text.textContent = labels[state] || state;
    if (state === 'disconnected') this.toast('与服务器连接已断开', 'error');
    else if (state === 'connected' && this._wasDisconnected) this.toast('已重新连接', 'success');
    this._wasDisconnected = (state === 'disconnected' || state === 'reconnecting');
  },

  // ===== 会话搜索 =====
  _initSessionSearch() {
    const header = document.querySelector('.chat-sidebar-header');
    if (!header) return;
    const searchEl = document.createElement('div');
    searchEl.className = 'session-search';
    searchEl.innerHTML = `<input type="text" id="sessionSearch" class="session-search-input" placeholder="搜索会话... (⌘F)">`;
    header.after(searchEl);

    const searchInput = document.getElementById('sessionSearch');
    searchInput.addEventListener('input', (e) => this._filterSessions(e.target.value));

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
      item.style.display = (!q || title.toLowerCase().includes(q)) ? '' : 'none';
    });
  },

  // ===== 移动端手势 =====
  _initMobileGestures() {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let longPressTimer = null;
    const sidebar = document.getElementById('chatSidebar');

    document.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();

      // 长按检测（对话消息）
      const msgEl = e.target.closest('.message');
      if (msgEl) {
        longPressTimer = setTimeout(() => {
          this._showContextMenu(e.touches[0].clientX, e.touches[0].clientY, msgEl);
        }, 600);
      }
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }

      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;

      // 左滑显示/隐藏侧栏（仅在对话视图）
      if (this.currentView === 'chat' && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
        if (dx > 0 && touchStartX < 50) {
          sidebar.classList.remove('mobile-hidden');
        } else if (dx < 0) {
          sidebar.classList.add('mobile-hidden');
        }
      }
    }, { passive: true });

    document.addEventListener('touchend', () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    });
  },

  _showContextMenu(x, y, msgEl) {
    const menu = document.getElementById('contextMenu');
    menu.classList.remove('hidden');
    menu.style.left = Math.min(x, window.innerWidth - 160) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 100) + 'px';

    // 绑定动作
    menu.querySelectorAll('.context-menu-item').forEach(item => {
      item.onclick = () => {
        const action = item.dataset.action;
        if (action === 'copy') {
          const content = msgEl.querySelector('.message-content')?.textContent || '';
          navigator.clipboard.writeText(content);
          this.toast('已复制到剪贴板', 'success');
        } else if (action === 'export') {
          this.modules.chat.exportCurrentChat();
        }
        menu.classList.add('hidden');
      };
    });

    // 点击其他地方关闭
    setTimeout(() => {
      document.addEventListener('click', () => menu.classList.add('hidden'), { once: true });
    }, 10);
  },

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });
    document.querySelectorAll('.view').forEach(panel => {
      panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });
    switch (viewName) {
      case 'terminal': this.modules.terminal.onShow(); break;
      case 'files': this.modules.files.onShow(); break;
      case 'dashboard': this.modules.dashboard.onShow(); break;
    }
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, 3000);
  },
};

document.addEventListener('DOMContentLoaded', () => { App.init(); });
