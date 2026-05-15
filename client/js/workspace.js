// 工作区管理模块 — 自由选择工作区 + 文件树 + 目录浏览器
class WorkspaceModule {
  constructor() {
    this.currentWorkspace = '';
    this.history = [];
    this.fileTreeVisible = false;
    this.dirBrowserPath = '';

    // DOM 元素
    this.input = document.getElementById('workDirInput');
    this.dropdown = document.getElementById('workspaceDropdown');
    this.historyList = document.getElementById('workspaceHistoryList');
    this.fileTreePanel = document.getElementById('fileTreePanel');
    this.fileTreeContent = document.getElementById('fileTreeContent');
    this.fileTreeTitle = document.getElementById('fileTreeTitle');
    this.dirBrowserModal = document.getElementById('dirBrowserModal');
    this.dirBrowserPath = document.getElementById('dirBrowserPath');
    this.dirBrowserList = document.getElementById('dirBrowserList');
  }

  async init() {
    this._bindEvents();
    await this._loadWorkspace();
  }

  // 获取当前工作区路径
  getWorkDir() {
    return this.currentWorkspace || this.input.value || '';
  }

  // ===== 事件绑定 =====
  _bindEvents() {
    // 输入框聚焦 → 显示历史列表
    this.input.addEventListener('focus', () => this._showDropdown());
    this.input.addEventListener('input', () => this._filterDropdown());

    // 输入框回车 → 切换工作区
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = this.input.value.trim();
        if (val) this.switchWorkspace(val);
        this._hideDropdown();
      } else if (e.key === 'Escape') {
        this._hideDropdown();
        this.input.blur();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._navigateDropdown(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._navigateDropdown(-1);
      }
    });

    // 点击外部关闭下拉框
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#workspaceSelector')) {
        this._hideDropdown();
      }
    });

    // 浏览按钮
    document.getElementById('btnBrowseWorkspace').addEventListener('click', (e) => {
      e.stopPropagation();
      this._openDirBrowser();
    });

    // 文件树切换按钮
    document.getElementById('btnToggleFileTree').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFileTree();
    });

    // 文件树关闭按钮
    document.getElementById('btnCloseFileTree').addEventListener('click', () => {
      this.toggleFileTree(false);
    });

    // 目录浏览器：关闭/取消/确认
    document.getElementById('btnCloseDirBrowser').addEventListener('click', () => this._closeDirBrowser());
    document.getElementById('btnDirBrowserCancel').addEventListener('click', () => this._closeDirBrowser());
    document.getElementById('btnDirBrowserConfirm').addEventListener('click', () => this._confirmDirBrowser());
    this.dirBrowserModal.querySelector('.dir-browser-overlay').addEventListener('click', () => this._closeDirBrowser());

    // 文件树面板内点击代理
    this.fileTreeContent.addEventListener('click', (e) => {
      const treeItem = e.target.closest('.tree-item');
      if (!treeItem) return;

      const itemPath = treeItem.dataset.path;
      const itemType = treeItem.dataset.type;

      if (itemType === 'directory') {
        // 点击目录 → 展开/收起
        this._toggleTreeDir(treeItem);
      } else {
        // 点击文件 → 插入路径到输入框
        this._insertFilePath(itemPath);
      }
    });
  }

  // ===== 加载工作区 =====
  async _loadWorkspace() {
    try {
      const res = await Auth.fetch('/api/workspace');
      const data = await res.json();
      this.currentWorkspace = data.data.current;
      this.history = data.data.history || [];
      this.input.value = this._shortenPath(this.currentWorkspace);
      this.input.title = this.currentWorkspace;
      this._renderHistory();
      // 加载文件树（如果面板已打开）
      if (this.fileTreeVisible) this._loadFileTree();
    } catch (err) {
      // 后备: 使用 HOME
      this.input.value = '~/';
    }
  }

  // ===== 切换工作区 =====
  async switchWorkspace(dirPath) {
    try {
      const res = await Auth.fetch('/api/workspace/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = await res.json();

      if (data.error) {
        App.toast(data.error.message, 'error');
        return;
      }

      this.currentWorkspace = data.data.current;
      this.history = data.data.history || [];
      this.input.value = this._shortenPath(this.currentWorkspace);
      this.input.title = this.currentWorkspace;
      this._renderHistory();

      // 联动其他模块
      this._notifyWorkspaceChange();
      App.toast(`已切换到: ${this._shortenPath(this.currentWorkspace)}`, 'success');
    } catch (err) {
      App.toast('切换工作区失败: ' + err.message, 'error');
    }
  }

  // ===== 通知其他模块 =====
  _notifyWorkspaceChange() {
    // 刷新文件树
    if (this.fileTreeVisible) this._loadFileTree();

    // 终端 cd
    if (App.modules.terminal) {
      App.modules.terminal.cdToWorkspace(this.currentWorkspace);
    }

    // 文件视图
    if (App.modules.files) {
      App.modules.files.loadDirectory(this.currentWorkspace);
    }

    // 重新加载会话列表
    if (App.modules.chat) {
      App.modules.chat._loadSessions();
    }
  }

  // ===== 下拉历史列表 =====
  _showDropdown() {
    this._renderHistory();
    this.dropdown.classList.remove('hidden');
  }

  _hideDropdown() {
    this.dropdown.classList.add('hidden');
  }

  _filterDropdown() {
    const q = this.input.value.toLowerCase();
    const items = this.historyList.querySelectorAll('.workspace-history-item');
    items.forEach(item => {
      const path = item.dataset.path.toLowerCase();
      item.style.display = (!q || path.includes(q)) ? '' : 'none';
    });
  }

  _navigateDropdown(direction) {
    const items = [...this.historyList.querySelectorAll('.workspace-history-item:not([style*="display: none"])')];
    if (!items.length) return;
    const current = items.findIndex(i => i.classList.contains('highlighted'));
    items.forEach(i => i.classList.remove('highlighted'));
    let next = current + direction;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    items[next].classList.add('highlighted');
    // 更新输入框预览
    this.input.value = items[next].dataset.path;
  }

  _renderHistory() {
    if (!this.history || this.history.length === 0) {
      this.historyList.innerHTML = '<div class="workspace-history-empty">暂无历史记录</div>';
      return;
    }

    this.historyList.innerHTML = this.history.map(h => {
      const shortPath = this._shortenPath(h.path);
      const pinIcon = h.pinned ? '📌 ' : '';
      return `
        <div class="workspace-history-item" data-path="${this._escapeAttr(h.path)}">
          <span class="wh-path">${pinIcon}${this._escapeHtml(shortPath)}</span>
          <div class="wh-actions">
            <button class="wh-pin" title="置顶" data-action="pin">📌</button>
            <button class="wh-remove" title="移除" data-action="remove">✕</button>
          </div>
        </div>
      `;
    }).join('');

    // 绑定点击
    this.historyList.querySelectorAll('.workspace-history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (action) {
          e.stopPropagation();
          const act = action.dataset.action;
          if (act === 'pin') this._pinWorkspace(item.dataset.path);
          else if (act === 'remove') this._removeFromHistory(item.dataset.path);
          return;
        }
        this.switchWorkspace(item.dataset.path);
        this._hideDropdown();
      });
    });
  }

  async _pinWorkspace(dirPath) {
    try {
      const res = await Auth.fetch('/api/workspace/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = await res.json();
      this.history = data.data.history;
      this._renderHistory();
    } catch (err) {}
  }

  async _removeFromHistory(dirPath) {
    try {
      const res = await Auth.fetch('/api/workspace/history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: dirPath }),
      });
      const data = await res.json();
      this.history = data.data.history;
      this._renderHistory();
    } catch (err) {}
  }

  // ===== 文件树面板 =====
  toggleFileTree(show) {
    this.fileTreeVisible = (show !== undefined) ? show : !this.fileTreeVisible;
    this.fileTreePanel.classList.toggle('hidden', !this.fileTreeVisible);

    // 更新切换按钮的方向
    const icon = document.querySelector('#btnToggleFileTree svg polyline');
    if (icon) {
      icon.setAttribute('points', this.fileTreeVisible ? '15 18 9 12 15 6' : '9 18 15 12 9 6');
    }

    if (this.fileTreeVisible && this.currentWorkspace) {
      this._loadFileTree();
    }
  }

  async _loadFileTree(dirPath) {
    const target = dirPath || this.currentWorkspace;
    if (!target) return;

    try {
      const res = await Auth.fetch(`/api/workspace/tree?path=${encodeURIComponent(target)}`);
      const data = await res.json();
      const items = data.data.items || [];

      this.fileTreeTitle.textContent = this._shortenPath(data.data.path);
      this.fileTreeTitle.title = data.data.path;

      if (items.length === 0) {
        this.fileTreeContent.innerHTML = '<div class="empty-state">目录为空</div>';
        return;
      }

      this.fileTreeContent.innerHTML = items.map(item => this._renderTreeItem(item, 0)).join('');
    } catch (err) {
      this.fileTreeContent.innerHTML = '<div class="empty-state">加载失败</div>';
    }
  }

  _renderTreeItem(item, depth) {
    const indent = depth * 16;
    const icon = item.type === 'directory' ? '📁' : this._getFileIcon(item.extension);
    const sizeStr = (item.type === 'file' && item.size !== undefined) ? `<span class="tree-item-size">${this._formatSize(item.size)}</span>` : '';

    return `
      <div class="tree-item tree-item-${item.type}" data-path="${this._escapeAttr(item.path)}" data-type="${item.type}" style="padding-left: ${12 + indent}px" draggable="${item.type === 'file' ? 'true' : 'false'}">
        <span class="tree-item-icon">${icon}</span>
        <span class="tree-item-name">${this._escapeHtml(item.name)}</span>
        ${sizeStr}
        ${item.type === 'directory' ? '<span class="tree-item-expand">›</span>' : ''}
      </div>
    `;
  }

  async _toggleTreeDir(treeItem) {
    const dirPath = treeItem.dataset.path;
    const isExpanded = treeItem.classList.contains('expanded');

    if (isExpanded) {
      // 收起：移除后续子节点
      treeItem.classList.remove('expanded');
      const expandIcon = treeItem.querySelector('.tree-item-expand');
      if (expandIcon) expandIcon.textContent = '›';
      let next = treeItem.nextElementSibling;
      while (next && next.classList.contains('tree-child-of-' + this._pathToClass(dirPath))) {
        const toRemove = next;
        next = next.nextElementSibling;
        toRemove.remove();
      }
    } else {
      // 展开：加载子目录
      treeItem.classList.add('expanded');
      const expandIcon = treeItem.querySelector('.tree-item-expand');
      if (expandIcon) expandIcon.textContent = '⌄';

      try {
        const res = await Auth.fetch(`/api/workspace/tree?path=${encodeURIComponent(dirPath)}`);
        const data = await res.json();
        const items = data.data.items || [];
        const currentDepth = parseInt(treeItem.style.paddingLeft) || 12;
        const childDepth = ((currentDepth - 12) / 16) + 1;

        const childHtml = items.map(item => {
          const html = this._renderTreeItem(item, childDepth);
          // 给子元素加标记类方便收起时删除
          return html.replace('class="tree-item', `class="tree-item tree-child-of-${this._pathToClass(dirPath)}`);
        }).join('');

        treeItem.insertAdjacentHTML('afterend', childHtml);

        // 给新加的子文件绑定拖拽
        this._bindTreeDrag();
      } catch (err) {}
    }
  }

  _bindTreeDrag() {
    this.fileTreeContent.querySelectorAll('.tree-item[draggable="true"]').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', item.dataset.path);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
  }

  _insertFilePath(filePath) {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;

    const current = chatInput.value;
    const prefix = current ? current + ' ' : '';
    chatInput.value = prefix + filePath;
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 150) + 'px';
    chatInput.focus();
    App.toast(`已插入: ${filePath.split('/').pop()}`, 'info');
  }

  // ===== 目录浏览器 =====
  _openDirBrowser() {
    this.dirBrowserModal.classList.remove('hidden');
    this._browsePath = this.currentWorkspace || (typeof process !== 'undefined' ? process.env.HOME : '/');
    this._loadDirBrowser(this._browsePath);
  }

  _closeDirBrowser() {
    this.dirBrowserModal.classList.add('hidden');
  }

  _confirmDirBrowser() {
    this.switchWorkspace(this._browsePath);
    this._closeDirBrowser();
  }

  async _loadDirBrowser(dirPath) {
    this._browsePath = dirPath;
    const pathEl = document.getElementById('dirBrowserPath');
    const listEl = document.getElementById('dirBrowserList');

    pathEl.textContent = dirPath;

    try {
      const res = await Auth.fetch(`/api/workspace/browse?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();

      if (data.error) {
        listEl.innerHTML = `<div class="empty-state">${data.error.message}</div>`;
        return;
      }

      const { parent, directories, current } = data.data;
      this._browsePath = current;
      pathEl.textContent = current;

      let html = '';
      if (parent) {
        html += `<div class="dir-browser-item dir-browser-parent" data-path="${this._escapeAttr(parent)}">
          <span class="dir-icon">⬆️</span>
          <span class="dir-name">..</span>
        </div>`;
      }

      html += directories.map(d => `
        <div class="dir-browser-item" data-path="${this._escapeAttr(d.path)}">
          <span class="dir-icon">📁</span>
          <span class="dir-name">${this._escapeHtml(d.name)}</span>
        </div>
      `).join('');

      if (directories.length === 0 && !parent) {
        html = '<div class="empty-state">没有子目录</div>';
      }

      listEl.innerHTML = html;

      // 绑定点击进入子目录
      listEl.querySelectorAll('.dir-browser-item').forEach(item => {
        item.addEventListener('click', () => {
          this._loadDirBrowser(item.dataset.path);
        });
      });
    } catch (err) {
      listEl.innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`;
    }
  }

  // ===== 工具方法 =====
  _shortenPath(p) {
    if (!p) return '';
    const home = '/Users/' + (p.match(/^\/Users\/([^/]+)/)?.[1] || '');
    if (home && p.startsWith(home)) return '~' + p.slice(home.length);
    return p;
  }

  _pathToClass(p) {
    return p.replace(/[^a-zA-Z0-9]/g, '-');
  }

  _getFileIcon(ext) {
    const icons = {
      js: '📜', ts: '📘', jsx: '⚛️', tsx: '⚛️',
      json: '📋', md: '📝', html: '🌐', css: '🎨',
      py: '🐍', go: '🐹', rs: '🦀', java: '☕',
      sh: '⚙️', yml: '📄', yaml: '📄', toml: '📄',
      png: '🖼️', jpg: '🖼️', svg: '🖼️', gif: '🖼️',
      pdf: '📕', zip: '📦', tar: '📦',
    };
    return icons[ext] || '📄';
  }

  _formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  _escapeAttr(text) {
    return (text || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
