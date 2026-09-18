import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const managersDir = path.join(dataDir, 'managers');
const legacyFile = path.join(dataDir, 'managers.json');

/**
 * 宿管账号按校区独立成文件存放（每个校区一个 json），
 * 因此不同校区允许同名账号、改密/删除互不影响。
 * 文件名由校区名派生：过滤文件系统的非法字符，中文校区名保持可读。
 */
const fileFor = (campus) => {
  const safe = String(campus || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[. ]+$/, '');
  return path.join(managersDir, `${safe || '_'}.json`);
};

export const readManagers = (campus) => {
  try {
    const list = JSON.parse(fs.readFileSync(fileFor(campus), 'utf8'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

export const writeManagers = (campus, list) => {
  fs.mkdirSync(managersDir, { recursive: true });
  fs.writeFileSync(fileFor(campus), JSON.stringify(list, null, 2), 'utf8');
};

/** 校区改名：账号文件跟着改名，并更新文件内每条账号的校区字段。 */
export const renameCampusAccounts = (from, to) => {
  const fromFile = fileFor(from);
  if (!fs.existsSync(fromFile)) return false;
  writeManagers(
    to,
    readManagers(from).map((item) => ({ ...item, campus: to })),
  );
  if (fileFor(to) !== fromFile) fs.unlinkSync(fromFile);
  return true;
};

/** 校区删除：连带删除该校区的账号文件，避免留下挂着已删校区的账号。 */
export const removeCampusAccounts = (campus) => {
  const file = fileFor(campus);
  if (fs.existsSync(file)) fs.unlinkSync(file);
};

/** 把旧的单一 managers.json 按校区拆分到各自文件（启动时执行一次），迁移后删除旧文件。 */
export const migrateLegacyManagers = () => {
  if (!fs.existsSync(legacyFile)) return;
  try {
    const list = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
    const grouped = {};
    (Array.isArray(list) ? list : []).forEach((item) => {
      // 没有校区的历史账号无法归属任何校区文件，直接丢弃
      if (!item || !item.campus) return;
      grouped[item.campus] = grouped[item.campus] || [];
      grouped[item.campus].push(item);
    });
    Object.entries(grouped).forEach(([campus, accounts]) => writeManagers(campus, accounts));
    fs.unlinkSync(legacyFile);
    console.log(`账号数据已按校区拆分到 ${path.relative(__dirname, managersDir)}/`);
  } catch (err) {
    console.error('拆分 managers.json 失败，保留原文件：', err);
  }
};