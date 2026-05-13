const os = require('os');

module.exports = {
  getSystemInfo() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      cpuModel: cpus[0]?.model || 'Unknown',
      cpuCores: cpus.length,
      memTotal: totalMem,
      memUsed: usedMem,
      memFree: freeMem,
      uptime: os.uptime(),
    };
  },
};
