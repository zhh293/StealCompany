const catdesk = require('../services/catdesk');
const { getSystemInfo } = require('../services/systemInfo');

module.exports = function (nsp) {
  let lastSessionsJson = '';
  let pollInterval = null;
  let connectedClients = 0;

  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
      try {
        const sessions = catdesk.getSessions();
        const json = JSON.stringify(sessions);
        if (json !== lastSessionsJson) {
          lastSessionsJson = json;
          nsp.emit('status:sessions', sessions);
        }
      } catch (err) {
        // 静默失败，不中断轮询
      }
    }, 5000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  nsp.on('connection', (socket) => {
    connectedClients++;
    startPolling();

    // 立即推送一次数据
    try {
      const sessions = catdesk.getSessions();
      socket.emit('status:sessions', sessions);
      lastSessionsJson = JSON.stringify(sessions);
    } catch (err) { /* ignore */ }

    socket.emit('status:system', getSystemInfo());

    socket.on('status:refresh', () => {
      try {
        socket.emit('status:sessions', catdesk.getSessions());
        socket.emit('status:system', getSystemInfo());
      } catch (err) { /* ignore */ }
    });

    socket.on('disconnect', () => {
      connectedClients--;
      if (connectedClients <= 0) {
        connectedClients = 0;
        stopPolling();
      }
    });
  });
};
