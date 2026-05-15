const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const USAGE_FILE = path.join(__dirname, '../../logs/usage.json');

// 获取用量统计
router.get('/usage/stats', (req, res) => {
  try {
    const stats = loadUsageStats();
    res.json({ data: stats });
  } catch (err) {
    res.json({ data: getEmptyStats() });
  }
});

// 记录一次用量（由 chat 完成时内部调用）
router.post('/usage/record', (req, res) => {
  const { model, cost, tokens, duration } = req.body;
  try {
    recordUsage({ model, cost, tokens, duration });
    res.json({ data: { success: true } });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

function getEmptyStats() {
  return {
    totalCost: 0,
    totalTokens: 0,
    totalRequests: 0,
    byModel: {},
    daily: [],
  };
}

function loadUsageStats() {
  if (!fs.existsSync(USAGE_FILE)) return getEmptyStats();
  const raw = fs.readFileSync(USAGE_FILE, 'utf-8');
  return JSON.parse(raw);
}

function recordUsage({ model, cost, tokens, duration }) {
  const stats = loadUsageStats();
  const today = new Date().toISOString().slice(0, 10);

  stats.totalCost = (stats.totalCost || 0) + (cost || 0);
  stats.totalTokens = (stats.totalTokens || 0) + (tokens || 0);
  stats.totalRequests = (stats.totalRequests || 0) + 1;

  // 按模型统计
  if (!stats.byModel) stats.byModel = {};
  const m = model || 'unknown';
  if (!stats.byModel[m]) stats.byModel[m] = { cost: 0, requests: 0, tokens: 0 };
  stats.byModel[m].cost += (cost || 0);
  stats.byModel[m].requests += 1;
  stats.byModel[m].tokens += (tokens || 0);

  // 按日统计（保留最近 30 天）
  if (!stats.daily) stats.daily = [];
  let todayEntry = stats.daily.find(d => d.date === today);
  if (!todayEntry) {
    todayEntry = { date: today, cost: 0, requests: 0, tokens: 0 };
    stats.daily.push(todayEntry);
  }
  todayEntry.cost += (cost || 0);
  todayEntry.requests += 1;
  todayEntry.tokens += (tokens || 0);

  // 只保留最近 30 天
  stats.daily = stats.daily.slice(-30);

  // 写入文件
  const dir = path.dirname(USAGE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(stats, null, 2));
}

module.exports = router;
module.exports.recordUsage = recordUsage;
