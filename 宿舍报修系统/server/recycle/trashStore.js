import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

/** 回收站默认保留天数（管理员可在回收站页面调整） */
export const DEFAULT_RETENTION_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RETENTION_DAYS = 365;

const clampRetention = (value) => {
  const days = Math.round(Number(value));
  if (!Number.isFinite(days)) return DEFAULT_RETENTION_DAYS;
  return Math.min(MAX_RETENTION_DAYS, Math.max(1, days));
};

/**
 * 回收站存储：删除的数据先移入回收站，保留期内可恢复，到期自动清理。
 * 回收站条目不支持手动删除（避免二次误删），过期条目的附属文件由 onPurge 回调清理。
 */
export const createTrashStore = ({ dataFile, onPurge }) => {
  const readRaw = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      return {
        retentionDays: clampRetention(parsed?.retentionDays),
        items: Array.isArray(parsed?.items) ? parsed.items : [],
      };
    } catch {
      return { retentionDays: DEFAULT_RETENTION_DAYS, items: [] };
    }
  };

  const write = (data) => {
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
  };

  const isExpired = (item, retentionDays, now) => {
    const deletedAt = Date.parse(item?.deletedAt);
    return Number.isFinite(deletedAt) && now - deletedAt >= retentionDays * DAY_MS;
  };

  /** 读取回收站（顺带清理过期条目），条目按删除时间倒序返回。 */
  const read = () => {
    const data = readRaw();
    const now = Date.now();
    const expired = data.items.filter((item) => isExpired(item, data.retentionDays, now));
    if (!expired.length) {
      return {
        retentionDays: data.retentionDays,
        items: data.items.sort((a, b) => Date.parse(b.deletedAt) - Date.parse(a.deletedAt)),
      };
    }
    const items = data.items.filter((item) => !expired.includes(item));
    write({ retentionDays: data.retentionDays, items });
    expired.forEach((item) => {
      try {
        onPurge?.(item);
      } catch (error) {
        console.error('回收站过期条目清理失败', error);
      }
    });
    return { retentionDays: data.retentionDays, items };
  };

  /** 批量追加删除记录，字段由调用方提供（type / label / payload / deletedBy）。 */
  const append = (entries) => {
    const list = (Array.isArray(entries) ? entries : []).filter(Boolean);
    if (!list.length) return 0;
    const data = read();
    const items = [
      ...list.map((entry) => ({ id: uuidv4(), deletedAt: new Date().toISOString(), ...entry })),
      ...data.items,
    ];
    write({ retentionDays: data.retentionDays, items });
    return list.length;
  };

  /** 取一条未过期的条目（不会移除，恢复成功后再调用 drop）。 */
  const get = (id) => read().items.find((item) => item.id === id) || null;

  const drop = (id) => {
    const data = readRaw();
    const items = data.items.filter((item) => item.id !== id);
    write({ retentionDays: data.retentionDays, items });
  };

  const setRetention = (value) => {
    const data = read();
    const retentionDays = clampRetention(value);
    write({ retentionDays, items: data.items });
    return retentionDays;
  };

  return { read, append, get, drop, setRetention };
};