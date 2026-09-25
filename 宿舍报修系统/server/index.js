import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { readAdminPassword, writeAdminPassword } from './adminStore.js';
import {
  INITIAL_STUDENT_PASSWORD,
  INITIAL_STUDENT_USERNAME,
  readStudentAccount,
  writeStudentPassword,
} from './studentStore.js';
import { migrateLegacyManagers, readManagers, removeCampusAccounts, renameCampusAccounts, writeManagers } from './managerStore.js';
import { createManagerRoutes } from './managerRoutes.js';
import { getSession as readStoredSession, removeSessions, saveSession } from './sessionStore.js';
import { isAlnum } from './validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'uploads');
const dataFile = path.join(dataDir, 'repairs.json');
const configFile = path.join(dataDir, 'config.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, '[]', 'utf8');
}
if (!fs.existsSync(configFile)) {
  fs.writeFileSync(configFile, JSON.stringify({
    campuses: ['南校区', '北校区'],
    buildings: ['1号楼', '2号楼', '3号楼', '4号楼'],
  }, null, 2), 'utf8');
}

// 历史数据：旧的单一 managers.json 按校区拆分到 data/managers/<校区>.json
migrateLegacyManagers();

/**
 * 工单状态三态模型：未完成 → 维修中 → 已完成。
 * 历史数据里的「待处理 / 已处理」在读取时归一化，并在启动时一次性迁移落盘。
 */
const STATUS_PENDING = '未完成';
const STATUS_DOING = '维修中';
const STATUS_DONE = '已完成';
const VALID_STATUSES = new Set([STATUS_PENDING, STATUS_DOING, STATUS_DONE]);
const LEGACY_STATUS = { 待处理: STATUS_PENDING, 已处理: STATUS_DONE };

const normalizeStatus = (status) =>
  VALID_STATUSES.has(status) ? status : LEGACY_STATUS[status] || STATUS_PENDING;

(() => {
  let repairs = [];
  try {
    repairs = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch {
    repairs = [];
  }
  if (!Array.isArray(repairs)) return;
  let changed = false;
  repairs.forEach((item) => {
    const next = normalizeStatus(item.status);
    if (next !== item.status) {
      item.status = next;
      changed = true;
    }
  });
  if (changed) fs.writeFileSync(dataFile, JSON.stringify(repairs, null, 2), 'utf8');
})();

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// 登录态：token -> 登录身份，存盘保存（见 sessionStore.js），服务重启后依然有效。
// 管理员可管理校区/楼号/账号与全部工单；宿管只能处理自己楼号的工单。
const ADMIN_USERNAME = process.env.ADMIN_USER || 'admin';
/** 初始管理员密码：仅在还没有存盘密码时使用，管理员改密后会以 data/admin.json 为准 */
const INITIAL_ADMIN_PASSWORD = process.env.ADMIN_PASS || 'password123';
const adminPassword = () => readAdminPassword() || INITIAL_ADMIN_PASSWORD;

/** 学生账号：全局单一账号（初始 123456 / 123456），学生改密后以存盘文件为准 */
const studentAccount = () =>
  readStudentAccount() || { username: INITIAL_STUDENT_USERNAME, password: INITIAL_STUDENT_PASSWORD };

const readToken = (req) =>
  req.headers['x-admin-token'] || (req.headers.authorization || '').replace(/^Bearer\s*/i, '');

const getSession = (req) => readStoredSession(readToken(req));

const isAdminReq = (req) => getSession(req)?.role === 'admin';

/** 某校区的账号被删除或改密后，让它已签发的会话立即失效（不同校区的同名账号不受影响）。 */
const dropSessionsOf = (campus, username) =>
  removeSessions(
    (session) => session.role === 'manager' && session.campus === campus && session.username === username,
  );

app.post('/api/login', (req, res) => {
  const { username, password, campus, role } = req.body || {};
  // Validate username/password only contain letters and numbers
  if (!isAlnum(username) || !isAlnum(password)) {
    return res.status(400).json({ success: false, error: '用户名和密码仅允许字母与数字' });
  }

  // 学生入口显式带 role=student：只校验学生账号，不落入宿管分支，错误统一为「用户名或密码错误」
  if (role === 'student') {
    const student = studentAccount();
    if (username !== student.username || password !== student.password) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }
    const token = uuidv4();
    saveSession(token, { role: 'student', username: student.username });
    return res.json({ success: true, token, role: 'student', username: student.username });
  }

  // 管理员是全局账号，不受校区限制（登录页的校区留空即可）
  if (username === ADMIN_USERNAME && password === adminPassword()) {
    const token = uuidv4();
    saveSession(token, { role: 'admin', username: ADMIN_USERNAME });
    return res.json({ success: true, token, role: 'admin', username: ADMIN_USERNAME });
  }

  // 学生账号：全局单一账号，登录后才能提交报修（不需要选校区）
  const student = studentAccount();
  if (username === student.username && password === student.password) {
    const token = uuidv4();
    saveSession(token, { role: 'student', username: student.username });
    return res.json({ success: true, token, role: 'student', username: student.username });
  }

  // 宿管账号按校区分库存储，登录必须带上校区才能定位到唯一账号
  const chosenCampus = String(campus || '').trim();
  if (!chosenCampus) {
    return res.status(400).json({ success: false, error: '宿管账号请先选择所属校区（管理员请勾选「管理员」）' });
  }

  const manager = readManagers(chosenCampus).find(
    (item) => item.username === username && item.password === password,
  );
  if (!manager) {
    return res.status(401).json({ success: false, error: '用户名或密码错误' });
  }

  const token = uuidv4();
  const session = {
    role: 'manager',
    username: manager.username,
    campus: chosenCampus,
    building: manager.building || '',
  };
  saveSession(token, session);
  return res.json({ success: true, token, ...session });
});

const storage = multer.diskStorage({
  destination: (_, __, callback) => callback(null, uploadsDir),
  filename: (_, file, callback) => {
    const ext = path.extname(file.originalname) || '.jpg';
    callback(null, `${Date.now()}-${uuidv4()}${ext}`);
  },
});

const upload = multer({ storage });

const readRepairs = () => {
  const raw = fs.readFileSync(dataFile, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const readConfig = () => {
  try {
    const raw = fs.readFileSync(configFile, 'utf8');
    const parsed = JSON.parse(raw);
    const campuses = Array.isArray(parsed.campuses) ? parsed.campuses : ['南校区', '北校区'];
    const defaultBuildings = Array.isArray(parsed.buildings) ? parsed.buildings : ['1号楼', '2号楼', '3号楼', '4号楼'];
    const campusBuildings = parsed.campusBuildings && typeof parsed.campusBuildings === 'object' ? parsed.campusBuildings : {};
    const normalized = {};
    campuses.forEach((campus) => {
      const value = campusBuildings[campus];
      normalized[campus] = Array.isArray(value) ? value : defaultBuildings;
    });
    const buildings = [...new Set(Object.values(normalized).flat())];
    return {
      campuses,
      buildings,
      campusBuildings: normalized,
      // 忘记密码时提示学生联系的紧急联系电话，由管理员在后台维护
      emergencyPhone: typeof parsed.emergencyPhone === 'string' ? parsed.emergencyPhone : '',
    };
  } catch {
    return {
      campuses: ['南校区', '北校区'],
      buildings: ['1号楼', '2号楼', '3号楼', '4号楼'],
      campusBuildings: {
        南校区: ['1号楼', '2号楼', '3号楼', '4号楼'],
        北校区: ['1号楼', '2号楼', '3号楼', '4号楼']
      },
      emergencyPhone: '',
    };
  }
};

const writeConfig = (config) => {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf8');
};

const writeRepairs = (repairs) => {
  fs.writeFileSync(dataFile, JSON.stringify(repairs, null, 2), 'utf8');
};

app.get('/api/health', (_, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/repairs', (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(403).json({ error: '请先登录' });
  }
  // 工单总表只对管理员 / 宿管开放；学生只能走 /api/my-repairs 查自己的工单
  if (session.role === 'student') {
    return res.status(403).json({ error: '学生账号请在「我的报修」中查看' });
  }

  let repairs = readRepairs().map((item) => ({ ...item, status: normalizeStatus(item.status) }));
  if (session.role === 'manager') {
    // 宿管只能看到自己所在校区、自己楼号的工单
    repairs = repairs.filter((item) => item.campus === session.campus && item.building === session.building);
  }
  return res.json(repairs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
});

// 学生查询自己的报修：按「姓名 + 联系方式」精确匹配，在后端过滤，避免学生拿到他人工单
app.get('/api/my-repairs', (req, res) => {
  const session = getSession(req);
  if (!session || session.role !== 'student') {
    return res.status(403).json({ error: '请先使用学生账号登录' });
  }

  const name = String(req.query.name || '').trim();
  const contact = String(req.query.contact || '').trim();
  if (!name || !contact) {
    return res.status(400).json({ error: '请填写姓名与联系方式' });
  }

  const repairs = readRepairs()
    .map((item) => ({ ...item, status: normalizeStatus(item.status) }))
    .filter((item) => item.name === name && item.contact === contact)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return res.json(repairs);
});

// 宿管账号接口：按校区作用域化，数据按校区独立存取
app.use('/api/managers', createManagerRoutes({ isAdminReq, readConfig, dropSessionsOf }));

app.get('/api/config', (req, res) => {
  res.json(readConfig());
});

app.post('/api/config', (req, res) => {
  if (!isAdminReq(req)) return res.status(403).json({ error: '仅限管理员操作' });
  const { campuses, buildings, campusBuildings, campusRenames, emergencyPhone } = req.body || {};
  const existing = readConfig();

  // 紧急联系电话：留空表示未设置，填写时必须是 11 位数字（登录页「忘记密码」会原样提示）
  const nextPhone = emergencyPhone === undefined ? existing.emergencyPhone : String(emergencyPhone).trim();
  if (nextPhone && !/^\d{11}$/.test(nextPhone)) {
    return res.status(400).json({ error: '紧急联系电话需为 11 位数字' });
  }
  const nextCampuses = Array.isArray(campuses)
    ? campuses.map((item) => String(item).trim()).filter(Boolean)
    : existing.campuses;

  const nextCampusBuildings = {};
  nextCampuses.forEach((campus) => {
    const list = Array.isArray(campusBuildings && campusBuildings[campus])
      ? campusBuildings[campus]
      : Array.isArray(buildings)
        ? buildings
        : existing.campusBuildings[campus] || existing.buildings;
    nextCampusBuildings[campus] = list.map((item) => String(item).trim()).filter(Boolean);
  });

  const nextBuildings = [...new Set(Object.values(nextCampusBuildings).flat())];
  const next = {
    campuses: nextCampuses,
    buildings: nextBuildings,
    campusBuildings: nextCampusBuildings,
    emergencyPhone: nextPhone,
  };

  if (!next.campuses.length || !nextBuildings.length) {
    return res.status(400).json({ error: '校区和楼号至少各保留一项' });
  }

  writeConfig(next);

  // 账号数据按校区独立成文件，所以校区改名要跟着改文件名、删除校区要跟着删文件
  const renames = (Array.isArray(campusRenames) ? campusRenames : [])
    .map((item) => ({ from: String(item?.from || '').trim(), to: String(item?.to || '').trim() }))
    .filter((item) => item.from && item.to && item.from !== item.to);
  renames.forEach((item) => renameCampusAccounts(item.from, item.to));

  const renamedFrom = new Set(renames.map((item) => item.from));
  existing.campuses
    .filter((campus) => !next.campuses.includes(campus) && !renamedFrom.has(campus))
    .forEach((campus) => removeCampusAccounts(campus));

  res.json(next);
});

// 修改自己的密码：管理员与宿管共用，都要先校验原密码
app.patch('/api/me/password', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(403).json({ error: '请先登录' });

  const { oldPassword, newPassword } = req.body || {};
  if (!isAlnum(oldPassword) || !isAlnum(newPassword)) {
    return res.status(400).json({ error: '密码仅允许字母与数字' });
  }
  if (oldPassword === newPassword) {
    return res.status(400).json({ error: '新密码不能与原密码相同' });
  }

  if (session.role === 'admin') {
    if (oldPassword !== adminPassword()) {
      return res.status(401).json({ error: '原密码不正确' });
    }
    writeAdminPassword(newPassword);
    return res.json({ success: true, message: '密码修改成功' });
  }

  // 学生：改全局学生账号的密码（存 data/student.json）
  if (session.role === 'student') {
    if (oldPassword !== studentAccount().password) {
      return res.status(401).json({ error: '原密码不正确' });
    }
    writeStudentPassword(newPassword);
    // 其它设备上的旧登录态立即失效，当前这一台保持登录
    removeSessions(
      (item, token) => item.role === 'student' && token !== readToken(req),
    );
    return res.json({ success: true, message: '密码修改成功' });
  }

  // 宿管：改自己账号记录里的密码（账号按校区分库存放）
  const list = readManagers(session.campus);
  const index = list.findIndex((item) => item.username === session.username);
  if (index === -1) return res.status(404).json({ error: '账号不存在' });
  if (list[index].password !== oldPassword) {
    return res.status(401).json({ error: '原密码不正确' });
  }

  list[index].password = newPassword;
  writeManagers(session.campus, list);
  // 其它设备上的旧登录态立即失效，当前这一台保持登录
  removeSessions(
    (item, token) =>
      item.role === 'manager' &&
      item.campus === session.campus &&
      item.username === session.username &&
      token !== readToken(req),
  );

  return res.json({ success: true, message: '密码修改成功' });
});

app.post('/api/repairs', upload.single('image'), (req, res) => {
  // 提交报修必须是已登录的学生账号，避免匿名提交
  const session = getSession(req);
  if (!session || session.role !== 'student') {
    return res.status(403).json({ error: '请先使用学生账号登录' });
  }

  const { roomNumber, category, description, contact, name, building, campus } = req.body;

  if (!roomNumber || !category || !description || !building || !campus) {
    return res.status(400).json({ error: '缺少必要字段：校区、楼号、房间号、故障类型、描述不能为空' });
  }

  const repair = {
    id: uuidv4(),
    name: name || '',
    campus: campus || '',
    building: building || '',
    roomNumber,
    category,
    description,
    contact: contact || '',
    status: STATUS_PENDING,
    createdAt: new Date().toISOString(),
    image: req.file ? `/uploads/${req.file.filename}` : '',
  };

  const repairs = readRepairs();
  repairs.unshift(repair);
  writeRepairs(repairs);

  res.status(201).json(repair);
});

app.patch('/api/repairs/:id', (req, res) => {
  const session = getSession(req);
  if (!session) {
    return res.status(403).json({ error: '请先登录' });
  }
  if (session.role === 'student') {
    return res.status(403).json({ error: '学生账号不能处理工单' });
  }

  const repairs = readRepairs();
  const index = repairs.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: '未找到该报修记录' });
  }

  const target = repairs[index];
  if (session.role === 'manager' && (target.campus !== session.campus || target.building !== session.building)) {
    return res.status(403).json({ error: '只能处理本楼号的工单' });
  }

  // 状态流转：start=开始维修（未完成→维修中），finish=标记完成（未完成/维修中→已完成，兼容无 body 的旧调用）
  const action = String(req.body?.action || 'finish');
  const current = normalizeStatus(target.status);
  let nextStatus;
  if (action === 'start') {
    if (current === STATUS_DONE) return res.status(400).json({ error: '该工单已完成，不能再开始维修' });
    nextStatus = STATUS_DOING;
  } else if (action === 'finish') {
    if (current === STATUS_DONE) return res.status(400).json({ error: '该工单已是完成状态' });
    nextStatus = STATUS_DONE;
  } else {
    return res.status(400).json({ error: '不支持的操作' });
  }

  repairs[index].status = nextStatus;
  writeRepairs(repairs);
  res.json(repairs[index]);
});

app.delete('/api/repairs/:id', (req, res) => {
  if (!isAdminReq(req)) {
    return res.status(403).json({ error: '仅限管理员操作' });
  }

  const repairs = readRepairs();
  const index = repairs.findIndex((item) => item.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: '未找到该报修记录' });
  }

  const target = repairs[index];
  if (target.image) {
    const imageFile = path.basename(target.image);
    const imagePath = path.join(uploadsDir, imageFile);
    if (fs.existsSync(imagePath)) {
      fs.unlinkSync(imagePath);
    }
  }

  repairs.splice(index, 1);
  writeRepairs(repairs);
  res.json({ success: true, message: '删除成功' });
});

app.listen(PORT, () => {
  console.log(`宿舍报修后端已启动： http://localhost:${PORT}`);
});
