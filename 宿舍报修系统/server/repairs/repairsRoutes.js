import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DORM_MODULE_ID, findModule } from '../modules.js';

/** 查询码字符集：去掉 0/O/1/I 等易混字符，方便学生抄写保存 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_FOLLOW_UPS = 10;
const MAX_FEEDBACK_LENGTH = 300;

/**
 * 工单状态两态模型：未完成 → 已完成。
 * 历史数据里的「待处理 / 已处理 / 维修中」在读取时一律归一化
 * （启动时一次性迁移落盘，见 index.js），其中「维修中」归入未完成。
 */
export const STATUS_PENDING = '未完成';
export const STATUS_DONE = '已完成';
const VALID_STATUSES = new Set([STATUS_PENDING, STATUS_DONE]);
const LEGACY_STATUS = { 待处理: STATUS_PENDING, 已处理: STATUS_DONE, 维修中: STATUS_PENDING };

export const normalizeStatus = (status) =>
  VALID_STATUSES.has(status) ? status : LEGACY_STATUS[status] || STATUS_PENDING;

const makeCode = (used) => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i += 1) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    if (!used.has(code)) return code;
  }
  return uuidv4().replace(/-/g, '').slice(0, CODE_LENGTH).toUpperCase();
};

/**
 * 学生自查视图：隐藏联系方式等隐私字段，只提供进度与反馈所需信息。
 * 学生没有账号，凭查询码或提交时填写的手机号自助查看。
 */
const publicView = (item) => ({
  id: item.id,
  code: item.code || '',
  name: item.name || '',
  campus: item.campus || '',
  building: item.building || '',
  roomNumber: item.roomNumber || '',
  lab: item.lab || '',
  canteen: item.canteen || '',
  floor: item.floor || '',
  location: item.location || '',
  category: item.category || '',
  description: item.description || '',
  status: normalizeStatus(item.status),
  createdAt: item.createdAt || '',
  feedback: item.feedback || '',
  handledAt: item.handledAt || '',
  followUps: Array.isArray(item.followUps) ? item.followUps : [],
  image: item.image || '',
});

/**
 * 工单接口：提交、列表（宿管按楼号过滤）、标记处理（带文字说明）、删除（移入回收站）、
 * 以及学生自助的查询与追评反馈（无需登录）。
 * 存量工单没有 module 字段，一律按宿舍报修处理（moduleIdOf）。
 */
export const createRepairRoutes = ({ uploadsDir, readRepairs, writeRepairs, readConfig, getSession, isAdminReq, trashStore }) => {
  const moduleIdOf = (item) => item.module || DORM_MODULE_ID;

  const storage = multer.diskStorage({
    destination: (_, __, callback) => callback(null, uploadsDir),
    filename: (_, file, callback) => {
      const ext = path.extname(file.originalname) || '.jpg';
      callback(null, `${Date.now()}-${uuidv4()}${ext}`);
    },
  });
  const upload = multer({ storage });

  const router = express.Router();

  router.get('/', (req, res) => {
    const session = getSession(req);
    if (!session) {
      return res.status(403).json({ error: '请先登录' });
    }

    let repairs = readRepairs().map((item) => ({ ...item, status: normalizeStatus(item.status) }));
    if (session.role === 'manager') {
      // 宿管只能看到自己校区、自己楼号的「宿舍报修」工单：
      // 非宿舍模块（具体地点）工单仅管理员可见；校区/楼号为空串时也不能靠相等匹配放行
      const config = readConfig();
      repairs = repairs.filter((item) => {
        const mod = findModule(config, moduleIdOf(item));
        if (!mod || mod.locationMode !== 'building') return false;
        if (!item.building || !session.building) return false;
        return item.campus === session.campus && item.building === session.building;
      });
    }
    return res.json(repairs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
  });

  /** 学生查询（方式一）：凭查询码查单条工单 */
  router.get('/query', (req, res) => {
    const code = String(req.query.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ error: '请输入查询码' });
    const record = readRepairs().find((item) => (item.code || '').toUpperCase() === code);
    if (!record) return res.status(404).json({ error: '未找到该查询码对应的工单，请核对后重试' });
    return res.json(publicView(record));
  });

  /** 学生查询（方式二）：凭提交时填写的手机号查全部相关工单 */
  router.post('/query', (req, res) => {
    const contact = String(req.body?.contact || '').trim();
    if (!contact) return res.status(400).json({ error: '请填写手机号' });
    const matched = readRepairs()
      .filter((item) => (item.contact || '').trim() === contact)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(matched.map(publicView));
  });

  /** 学生追评反馈：对某条工单提交「催办 / 仍未解决」，管理员在工单里能看到 */
  router.post('/query/follow-up', (req, res) => {
    const { id, code, contact, text, kind } = req.body || {};
    const message = String(text || '').trim();
    if (!message) return res.status(400).json({ error: '请填写反馈内容' });
    if (message.length > 200) return res.status(400).json({ error: '反馈内容请控制在 200 字以内' });

    const repairs = readRepairs();
    const index = repairs.findIndex((item) => item.id === id);
    if (index === -1) return res.status(404).json({ error: '未找到该工单' });

    const record = repairs[index];
    const byCode = code && (record.code || '').toUpperCase() === String(code).trim().toUpperCase();
    const byContact = contact && (record.contact || '').trim() === String(contact).trim();
    if (!byCode && !byContact) {
      return res.status(403).json({ error: '身份校验未通过，请核对查询码或手机号' });
    }

    record.followUps = Array.isArray(record.followUps) ? record.followUps : [];
    if (record.followUps.length >= MAX_FOLLOW_UPS) {
      return res.status(400).json({ error: '反馈次数已达上限，请直接拨打紧急联系电话' });
    }
    record.followUps.push({
      id: uuidv4(),
      at: new Date().toISOString(),
      kind: kind === 'urge' ? 'urge' : 'unsolved',
      text: message,
    });
    writeRepairs(repairs);
    return res.json(publicView(record));
  });

  router.post('/', upload.single('image'), (req, res) => {
    const { roomNumber, category, description, contact, name, building, campus, module, location, lab, canteen, floor } =
      req.body;

    const mod = findModule(readConfig(), module || DORM_MODULE_ID);
    if (!mod || !mod.enabled) {
      return res.status(400).json({ error: '该报修模块不存在或已停用' });
    }

    // 各模块的地点字段（与「模块管理 → 地点设置」里维护的选项一一对应）：
    // 宿舍/教室/办公室 → 校区 + 楼号 + 房间号；实验室 → 校区 + 楼号 + 实验室；
    // 食堂 → 校区 + 食堂 + 层号；其余模块（自定义）→ 校区 + 楼层 + 具体地点，只对管理员可见
    const mode = mod.locationMode;
    const placeByMode = {
      building: [['building', building, '楼号'], ['roomNumber', roomNumber, '房间号']],
      room: [['building', building, '楼号'], ['roomNumber', roomNumber, '房间号']],
      lab: [['building', building, '楼号'], ['lab', lab, '实验室']],
      canteen: [['canteen', canteen, '食堂'], ['floor', floor, '层号']],
      custom: [['floor', floor, '楼层'], ['location', location, '具体地点']],
    };
    const place = placeByMode[mode] || placeByMode.custom;
    const missing = [['campus', campus, '校区'], ...place].filter(([, value]) => !value).map(([, , label]) => label);
    if (missing.length || !category || !description) {
      const labels = [...missing, ...(category ? [] : ['故障类型']), ...(description ? [] : ['描述'])];
      return res.status(400).json({ error: `缺少必要字段：${labels.join('、')}不能为空` });
    }

    const repairs = readRepairs();
    const usedCodes = new Set(
      repairs.map((item) => (item.code || '').toUpperCase()).filter(Boolean),
    );
    const repair = {
      id: uuidv4(),
      // 查询码：学生端凭它自助查询进度（无需账号），提交成功后展示一次
      code: makeCode(usedCodes),
      module: mod.id,
      name: name || '',
      campus,
      // 只保留该模式对应的地点字段，其余为空串（与历史工单的字段形状保持一致）
      building: mode === 'custom' || mode === 'canteen' ? '' : building,
      roomNumber: mode === 'building' || mode === 'room' ? roomNumber : '',
      lab: mode === 'lab' ? lab : '',
      canteen: mode === 'canteen' ? canteen : '',
      floor: mode === 'canteen' || mode === 'custom' ? floor : '',
      location: mode === 'custom' ? location : '',
      category,
      description,
      contact: contact || '',
      status: STATUS_PENDING,
      createdAt: new Date().toISOString(),
      image: req.file ? `/uploads/${req.file.filename}` : '',
    };

    repairs.unshift(repair);
    writeRepairs(repairs);

    return res.status(201).json(repair);
  });

  router.patch('/:id', (req, res) => {
    const session = getSession(req);
    if (!session) {
      return res.status(403).json({ error: '请先登录' });
    }

    const repairs = readRepairs();
    const index = repairs.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: '未找到该报修记录' });
    }

    const target = repairs[index];
    if (session.role === 'manager') {
      // 宿管只能处理本楼号的宿舍工单；非宿舍模块工单即使直连接口也拒绝
      const mod = findModule(readConfig(), moduleIdOf(target));
      if (!mod || mod.locationMode !== 'building') {
        return res.status(403).json({ error: '只能处理本楼号的宿舍工单' });
      }
      if (!target.building || !session.building || target.campus !== session.campus || target.building !== session.building) {
        return res.status(403).json({ error: '只能处理本楼号的工单' });
      }
    }

    // 状态流转：finish=标记完成（未完成 → 已完成，兼容无 body 的旧调用）
    const action = String(req.body?.action || 'finish');
    if (action !== 'finish') {
      return res.status(400).json({ error: '不支持的操作' });
    }
    if (normalizeStatus(target.status) === STATUS_DONE) {
      return res.status(400).json({ error: '该工单已是完成状态' });
    }

    repairs[index].status = STATUS_DONE;
    // 标记完成时记录处理说明与处理人：说明会展示给学生自查页面（可留空，最长 300 字）
    repairs[index].feedback = String(req.body?.feedback || '').trim().slice(0, MAX_FEEDBACK_LENGTH);
    repairs[index].handledAt = new Date().toISOString();
    repairs[index].handledBy = session.role === 'admin' ? '管理员' : `${session.campus} · ${session.username}`;
    writeRepairs(repairs);
    return res.json(repairs[index]);
  });

  /** 删除工单：移入回收站（保留期内可恢复），图片文件留到条目过期待清理时才删除 */
  router.delete('/:id', (req, res) => {
    if (!isAdminReq(req)) {
      return res.status(403).json({ error: '仅限管理员操作' });
    }

    const repairs = readRepairs();
    const index = repairs.findIndex((item) => item.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: '未找到该报修记录' });
    }

    const [target] = repairs.splice(index, 1);
    writeRepairs(repairs);
    // 姓名为空时不写入占位文案（与工单卡片展示口径一致）
    const owner = target.name ? `${target.name} · ` : '';
    trashStore.append([
      {
        type: 'repair',
        label: `报修工单「${owner}${target.campus || ''} ${target.category || ''}」`,
        payload: { record: target },
        deletedBy: 'admin',
      },
    ]);
    return res.json({ success: true, message: '已移入回收站，可在回收站恢复' });
  });

  /** 回收站恢复：把条目里的工单原样放回列表 */
  const restoreRepair = (item) => {
    const record = item.payload?.record;
    if (!record?.id) return { error: '条目数据不完整' };
    const repairs = readRepairs();
    if (repairs.some((entry) => entry.id === record.id)) return { message: '该工单已在列表中，无需恢复' };
    repairs.unshift(record);
    writeRepairs(repairs);
    return { message: '工单已恢复' };
  };

  return { router, restoreRepair };
};