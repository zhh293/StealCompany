// 文件浏览模块 — 支持在线编辑、分页预览
class FilesModule {
  constructor() {
    this.currentPath = '';
    this.currentFilePath = '';
    this.isEditing = false;
    this._needsRefresh = false;
    this.currentPage = 1;
    this.totalPages = 1;
    this.fileList = document.getElementById('fileList');
    this.filePreview = document.getElementById('filePreview');
    this.breadcrumb = document.getElementById('breadcrumb');
  }

  init() {
    document.getElementById('btnRefreshFiles').addEventListener('click', () => {
      this.loadDirectory(this.currentPath);
    });
  }

  async onShow() {
    if (!this.currentPath) {
      try {
        const res = await Auth.fetch('/api/settings/workspace-dirs');
        const data = await res.json();
        this.currentPath = data.data.defaultWorkspace;
      } catch {
        this.currentPath = '/Users/zhanghonghao/Desktop';
      }
    }

    if (this._needsRefresh) {
      this._needsRefresh = false;
      App.toast('文件列表已自动刷新', 'info');
    }

    this.loadDirectory(this.currentPath);
  }

  async loadDirectory(dirPath) {
    try {
      const res = await Auth.fetch(`/api/files/list?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      if (!res.ok) { App.toast(data.error?.message || '加载失败', 'error'); return; }
      this.currentPath = data.data.path;
      this._renderBreadcrumb(data.data.path);
      this._renderFileList(data.data.items);
    } catch (err) {
      App.toast('加载目录失败', 'error');
    }
  }

  async loadFile(filePath, page = 1) {
    try {
      const url = `/api/files/read?path=${encodeURIComponent(filePath)}&page=${page}&pageSize=500`;
      const res = await Auth.fetch(url);
      const data = await res.json();
      if (!res.ok) { App.toast(data.error?.message || '读取失败', 'error'); return; }
      this.currentFilePath = filePath;
      this.currentPage = data.data.currentPage;
      this.totalPages = data.data.totalPages;
      this._renderPreview(data.data);
    } catch (err) {
      App.toast('读取文件失败', 'error');
    }
  }

  _renderBreadcrumb(fullPath) {
    const parts = fullPath.split('/').filter(Boolean);
    let html = '<span class="breadcrumb-item" data-path="/">/</span>';
    let accumulated = '';
    for (const part of parts) {
      accumulated += '/' + part;
      html += `<span class="breadcrumb-sep">/</span><span class="breadcrumb-item" data-path="${accumulated}">${part}</span>`;
    }
    this.breadcrumb.innerHTML = html;
    this.breadcrumb.querySelectorAll('.breadcrumb-item').forEach(item => {
      item.addEventListener('click', () => this.loadDirectory(item.dataset.path));
    });
  }

  _renderFileList(items) {
    this.fileList.innerHTML = items.map(item => {
      const icon = item.type === 'directory' ? '📁' : this._getFileIcon(item.name);
      const size = item.size ? this._formatSize(item.size) : '';
      return `
        <div class="file-item" data-path="${item.path}" data-type="${item.type}">
          <span class="file-icon">${icon}</span>
          <span class="file-name">${item.name}</span>
          <span class="file-size">${size}</span>
        </div>
      `;
    }).join('');

    this.fileList.querySelectorAll('.file-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.type === 'directory') {
          this.loadDirectory(el.dataset.path);
        } else {
          this.fileList.querySelectorAll('.file-item').forEach(e => e.classList.remove('active'));
          el.classList.add('active');
          this.loadFile(el.dataset.path);
        }
      });
    });
  }

  _renderPreview(fileData) {
    const { content, extension, path: filePath, size, paginated, totalLines, totalPages, currentPage, startLine, endLine } = fileData;
    const isCode = ['js', 'ts', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml', 'md', 'sh', 'bash', 'zsh', 'sql', 'xml', 'vue', 'jsx', 'tsx'].includes(extension);

    let headerHtml = `
      <div class="preview-header">
        <div class="preview-info">
          <span class="preview-filename">${filePath.split('/').pop()}</span>
          <span class="preview-size">${this._formatSize(size)}</span>
          ${totalLines ? `<span class="preview-lines">${totalLines} 行</span>` : ''}
        </div>
        <div class="preview-actions">
          <button class="btn-preview-action" id="btnEditFile" title="编辑文件">✏️ 编辑</button>
          <button class="btn-preview-action hidden" id="btnSaveFile" title="保存文件">💾 保存</button>
          <button class="btn-preview-action hidden" id="btnCancelEdit" title="取消编辑">❌ 取消</button>
        </div>
      </div>
    `;

    let paginationHtml = '';
    if (paginated) {
      paginationHtml = `
        <div class="preview-pagination">
          <button class="btn-page" ${currentPage <= 1 ? 'disabled' : ''} data-page="${currentPage - 1}">← 上一页</button>
          <span class="page-info">第 ${currentPage} / ${totalPages} 页 (行 ${startLine}-${endLine})</span>
          <button class="btn-page" ${currentPage >= totalPages ? 'disabled' : ''} data-page="${currentPage + 1}">下一页 →</button>
        </div>
      `;
    }

    let contentHtml;
    if (isCode) {
      const highlighted = hljs.highlightAuto(content).value;
      contentHtml = `<pre class="preview-content" id="previewCode"><code class="hljs">${highlighted}</code></pre>`;
    } else {
      contentHtml = `<pre class="preview-content" id="previewCode">${this._escapeHtml(content)}</pre>`;
    }

    this.filePreview.innerHTML = headerHtml + contentHtml + paginationHtml;

    // 编辑按钮
    const btnEdit = document.getElementById('btnEditFile');
    const btnSave = document.getElementById('btnSaveFile');
    const btnCancel = document.getElementById('btnCancelEdit');

    btnEdit.addEventListener('click', () => {
      this._enterEditMode(content);
    });

    btnSave.addEventListener('click', () => {
      this._saveFile();
    });

    btnCancel.addEventListener('click', () => {
      this._exitEditMode();
      this.loadFile(this.currentFilePath, this.currentPage);
    });

    // 分页按钮
    this.filePreview.querySelectorAll('.btn-page').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = parseInt(btn.dataset.page);
        if (page >= 1 && page <= totalPages) {
          this.loadFile(this.currentFilePath, page);
        }
      });
    });
  }

  _enterEditMode(content) {
    this.isEditing = true;
    const codeEl = document.getElementById('previewCode');
    if (!codeEl) return;

    // 替换为 textarea
    const textarea = document.createElement('textarea');
    textarea.id = 'fileEditor';
    textarea.className = 'file-editor';
    textarea.value = content;
    textarea.spellcheck = false;
    codeEl.replaceWith(textarea);

    // 显示/隐藏按钮
    document.getElementById('btnEditFile').classList.add('hidden');
    document.getElementById('btnSaveFile').classList.remove('hidden');
    document.getElementById('btnCancelEdit').classList.remove('hidden');

    textarea.focus();
    App.toast('已进入编辑模式', 'info');
  }

  async _saveFile() {
    const editor = document.getElementById('fileEditor');
    if (!editor || !this.currentFilePath) return;

    try {
      const res = await Auth.fetch('/api/files/write', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: this.currentFilePath, content: editor.value }),
      });
      const data = await res.json();
      if (!res.ok) {
        App.toast(data.error?.message || '保存失败', 'error');
        return;
      }
      App.toast('文件已保存', 'success');
      this._exitEditMode();
      this.loadFile(this.currentFilePath, this.currentPage);
    } catch (err) {
      App.toast('保存失败: ' + err.message, 'error');
    }
  }

  _exitEditMode() {
    this.isEditing = false;
    document.getElementById('btnEditFile')?.classList.remove('hidden');
    document.getElementById('btnSaveFile')?.classList.add('hidden');
    document.getElementById('btnCancelEdit')?.classList.add('hidden');
  }

  _getFileIcon(name) {
    const ext = name.split('.').pop()?.toLowerCase();
    const icons = {
      js: '📜', ts: '📜', py: '🐍', java: '☕', go: '🔹',
      json: '📋', md: '📝', html: '🌐', css: '🎨', sh: '⚙️',
      png: '🖼️', jpg: '🖼️', gif: '🖼️', svg: '🖼️',
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
    div.textContent = text;
    return div.innerHTML;
  }
}
