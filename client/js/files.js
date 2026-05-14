// 文件浏览模块
class FilesModule {
  constructor() {
    this.currentPath = '';
    this._needsRefresh = false;
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
      // 获取默认目录
      try {
        const res = await Auth.fetch('/api/settings/workspace-dirs');
        const data = await res.json();
        this.currentPath = data.data.defaultWorkspace;
      } catch {
        this.currentPath = '/Users/zhanghonghao/Desktop';
      }
    }

    // 如果有待刷新标记，自动刷新
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

      if (!res.ok) {
        App.toast(data.error?.message || '加载失败', 'error');
        return;
      }

      this.currentPath = data.data.path;
      this._renderBreadcrumb(data.data.path);
      this._renderFileList(data.data.items);
    } catch (err) {
      App.toast('加载目录失败', 'error');
    }
  }

  async loadFile(filePath) {
    try {
      const res = await Auth.fetch(`/api/files/read?path=${encodeURIComponent(filePath)}`);
      const data = await res.json();

      if (!res.ok) {
        App.toast(data.error?.message || '读取失败', 'error');
        return;
      }

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
      item.addEventListener('click', () => {
        this.loadDirectory(item.dataset.path);
      });
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
          // 高亮选中
          this.fileList.querySelectorAll('.file-item').forEach(e => e.classList.remove('active'));
          el.classList.add('active');
          this.loadFile(el.dataset.path);
        }
      });
    });
  }

  _renderPreview(fileData) {
    const { content, extension, path, size } = fileData;
    const isCode = ['js', 'ts', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'h', 'css', 'html', 'json', 'yaml', 'yml', 'toml', 'md', 'sh', 'bash', 'zsh', 'sql', 'xml', 'vue', 'jsx', 'tsx'].includes(extension);

    if (isCode) {
      const highlighted = hljs.highlightAuto(content).value;
      this.filePreview.innerHTML = `<pre class="preview-content"><code class="hljs">${highlighted}</code></pre>`;
    } else {
      this.filePreview.innerHTML = `<pre class="preview-content">${this._escapeHtml(content)}</pre>`;
    }
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
