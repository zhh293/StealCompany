// 状态面板模块 — 含用量统计 + 审计日志
class DashboardModule {
  constructor() {
    this.socket = null;
    this.statsGrid = document.getElementById('statsGrid');
    this.sessionsEl = document.getElementById('dashboardSessions');
    this.usagePanel = document.getElementById('usagePanel');
    this.auditPanel = document.getElementById('auditPanel');
  }

  init() {
    this.socket = io('/status', {
      auth: { token: Auth.getToken() },
      reconnection: true,
      reconnectionAttempts: 10,
    });

    this.socket.on('status:sessions', (sessions) => this._renderSessions(sessions));
    this.socket.on('status:system', (info) => this._renderStats(info));

    document.getElementById('btnRefreshDashboard').addEventListener('click', () => {
      this.socket.emit('status:refresh');
    });

    document.getElementById('btnShowUsage').addEventListener('click', () => {
      this.usagePanel.classList.toggle('hidden');
      this.auditPanel.classList.add('hidden');
      if (!this.usagePanel.classList.contains('hidden')) this._loadUsageStats();
    });

    document.getElementById('btnShowAudit').addEventListener('click', () => {
      this.auditPanel.classList.toggle('hidden');
      this.usagePanel.classList.add('hidden');
      if (!this.auditPanel.classList.contains('hidden')) this._loadAuditLogs();
    });
  }

  onShow() {
    this.socket.emit('status:refresh');
  }

  _renderStats(info) {
    const memUsedGB = (info.memUsed / 1073741824).toFixed(1);
    const memTotalGB = (info.memTotal / 1073741824).toFixed(1);
    const memPercent = ((info.memUsed / info.memTotal) * 100).toFixed(0);
    const upHours = (info.uptime / 3600).toFixed(1);

    this.statsGrid.innerHTML = `
      <div class="stat-card">
        <div class="stat-label">CPU 负载</div>
        <div class="stat-value">${info.loadAvg[0].toFixed(2)}</div>
        <div class="stat-sub">1min / 5min / 15min</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">内存使用</div>
        <div class="stat-value">${memUsedGB} / ${memTotalGB} GB</div>
        <div class="stat-sub">${memPercent}% 已使用</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">系统运行</div>
        <div class="stat-value">${upHours} 小时</div>
        <div class="stat-sub">${info.platform} ${info.arch}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">主机名</div>
        <div class="stat-value">${info.hostname}</div>
        <div class="stat-sub">Node ${info.nodeVersion}</div>
      </div>
    `;
  }

  _renderSessions(sessions) {
    if (!sessions || sessions.length === 0) {
      this.sessionsEl.innerHTML = '<div class="empty-state">暂无活跃会话</div>';
      return;
    }

    this.sessionsEl.innerHTML = sessions.slice(0, 10).map(s => {
      const time = new Date(s.timestamp).toLocaleString('zh-CN');
      return `
        <div class="dashboard-session-card">
          <div class="session-dot ${s.status || 'success'}"></div>
          <div class="dashboard-session-info">
            <div class="dashboard-session-title">${s.title || '未命名'}</div>
            <div class="dashboard-session-path">${time}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ===== 用量统计 =====
  async _loadUsageStats() {
    try {
      const res = await Auth.fetch('/api/usage/stats');
      const data = await res.json();
      const stats = data.data;
      this._renderUsage(stats);
    } catch (err) {
      document.getElementById('usageDetails').innerHTML = '<p>加载失败</p>';
    }
  }

  _renderUsage(stats) {
    const chartEl = document.getElementById('usageChart');
    const detailsEl = document.getElementById('usageDetails');

    // 简单柱状图（CSS 实现）
    const daily = stats.daily || [];
    const maxCost = Math.max(...daily.map(d => d.cost), 0.01);

    chartEl.innerHTML = `
      <div class="usage-bar-chart">
        ${daily.slice(-14).map(d => {
          const height = Math.max((d.cost / maxCost) * 100, 2);
          const label = d.date.slice(5); // MM-DD
          return `
            <div class="usage-bar-col">
              <div class="usage-bar" style="height: ${height}%" title="$${d.cost.toFixed(4)} / ${d.requests} 次">
                <span class="usage-bar-value">$${d.cost.toFixed(3)}</span>
              </div>
              <span class="usage-bar-label">${label}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // 汇总信息
    const modelEntries = Object.entries(stats.byModel || {});
    detailsEl.innerHTML = `
      <div class="usage-summary">
        <div class="usage-stat">
          <span class="usage-stat-label">总花费</span>
          <span class="usage-stat-value">$${(stats.totalCost || 0).toFixed(4)}</span>
        </div>
        <div class="usage-stat">
          <span class="usage-stat-label">总请求数</span>
          <span class="usage-stat-value">${stats.totalRequests || 0}</span>
        </div>
        <div class="usage-stat">
          <span class="usage-stat-label">总 Token</span>
          <span class="usage-stat-value">${(stats.totalTokens || 0).toLocaleString()}</span>
        </div>
      </div>
      ${modelEntries.length > 0 ? `
        <h4 class="usage-section-title">按模型分布</h4>
        <div class="usage-models">
          ${modelEntries.map(([name, m]) => `
            <div class="usage-model-item">
              <span class="model-name">${name}</span>
              <span class="model-stats">${m.requests} 次 · $${m.cost.toFixed(4)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  // ===== 审计日志 =====
  async _loadAuditLogs() {
    try {
      const res = await Auth.fetch('/api/audit/logs?limit=50');
      const data = await res.json();
      const logs = data.data || [];
      this._renderAuditLogs(logs);
    } catch (err) {
      document.getElementById('auditList').innerHTML = '<p>加载失败</p>';
    }
  }

  _renderAuditLogs(logs) {
    const listEl = document.getElementById('auditList');
    if (logs.length === 0) {
      listEl.innerHTML = '<div class="empty-state">暂无审计记录</div>';
      return;
    }

    listEl.innerHTML = logs.map(log => {
      const time = new Date(log.timestamp).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const date = new Date(log.timestamp).toLocaleDateString('zh-CN');
      const resultClass = log.result === 'blocked' ? 'audit-blocked' : log.result === 'warning' ? 'audit-warning' : '';
      const resultIcon = log.result === 'blocked' ? '⛔' : log.result === 'warning' ? '⚠️' : '✅';
      return `
        <div class="audit-item ${resultClass}">
          <div class="audit-item-header">
            <span class="audit-icon">${resultIcon}</span>
            <span class="audit-action">${log.action}</span>
            <span class="audit-user">${log.user}</span>
            <span class="audit-time">${date} ${time}</span>
          </div>
          <div class="audit-detail">${this._escapeHtml(log.detail || '')}</div>
        </div>
      `;
    }).join('');
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
