import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, 'data', 'sessions.json');

/** 登录态有效期 30 天 */
const TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * 登录态存盘（token -> 身份信息）。
 * 放在文件而不是内存里：后端重启（改代码、重启电脑）后用户仍是登录状态，不用反复输账号密码。
 */
const sessions = new Map();

const persist = () => {
  try {
    fs.writeFileSync(file, JSON.stringify(Object.fromEntries(sessions), null, 2), 'utf8');
  } catch (err) {
    console.error('写入 sessions.json 失败', err);
  }
};

const isExpired = (session, now) => now - session.createdAt >= TTL;

// 启动时载入：过期登录态直接丢弃；早期数据没有 createdAt 的按当前时间重新计时
(() => {
  let raw = {};
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
  } catch {
    raw = {};
  }
  const now = Date.now();
  Object.entries(raw).forEach(([token, session]) => {
    const createdAt = Number(session?.createdAt) || now;
    if (!isExpired({ createdAt }, now)) sessions.set(token, { ...session, createdAt });
  });
})();

export const getSession = (token) => {
  const session = token ? sessions.get(token) : null;
  if (!session) return null;
  if (isExpired(session, Date.now())) {
    sessions.delete(token);
    persist();
    return null;
  }
  return session;
};

export const saveSession = (token, session) => {
  sessions.set(token, { ...session, createdAt: Date.now() });
  persist();
};

/** 按条件清理登录态（删账号、改密、改名后让旧登录态立即失效），返回清理条数。match 会同时拿到 token，便于保留当前这一端。 */
export const removeSessions = (match) => {
  let removed = 0;
  sessions.forEach((session, token) => {
    if (match(session, token)) {
      sessions.delete(token);
      removed += 1;
    }
  });
  if (removed) persist();
  return removed;
};