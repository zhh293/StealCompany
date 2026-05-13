// 状态面板模块
class DashboardModule {
  constructor() {
    this.socket = null;
    this.statsGrid = document.getElementById('statsGrid');
    this.sessionsEl = document.getElementById('dashboardSessions');
  }

  init() {
    this.socket = io('/status', { auth: { token: Auth.getToken() } });

    this.socket.on('status:sessions', (sessions) => {
      this._renderSessions(sessions);
    });

    this.socket.on('status:system', (info) => {
      this._renderStats(info);
    });

    document.getElementById('btnRefreshDashboard').addEventListener('click', () => {
      this.socket.emit('status:refresh');
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
        <div class="dashboard-session-item">
          <div class="session-title">${s.title || '未命名'}</div>
          <div class="session-info">
            <span class="session-status ${s.status}">${s.status}</span>
            <span>${time}</span>
          </div>
        </div>
      `;
    }).join('');
  }
}
