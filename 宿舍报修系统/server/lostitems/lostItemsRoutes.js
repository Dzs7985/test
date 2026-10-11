import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

/**
 * 失物招领：管理员发布拾获物品（带照片），师生可公开浏览并申请取回。
 * 物品状态：待认领 →（收到申请后管理员核实）→ 已认领
 * 认领申请：公开提交，管理员在后台可看到申请人与联系方式。
 */
export const createLostItemRoutes = ({ uploadsDir, dataFile, getSession, isAdminReq }) => {
  const readItems = () => {
    try {
      const raw = fs.readFileSync(dataFile, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  };

  const writeItems = (items) => {
    fs.writeFileSync(dataFile, JSON.stringify(items, null, 2), 'utf8');
  };

  const deleteImageFile = (image) => {
    if (!image) return;
    const file = path.join(uploadsDir, path.basename(image));
    if (fs.existsSync(file)) fs.unlinkSync(file);
  };

  const storage = multer.diskStorage({
    destination: (_, __, callback) => callback(null, uploadsDir),
    filename: (_, file, callback) => {
      const ext = path.extname(file.originalname) || '.jpg';
      callback(null, `lost-${Date.now()}-${uuidv4()}${ext}`);
    },
  });
  const upload = multer({ storage });

  const router = express.Router();

  /** 公开列表：所有人可浏览（含学生、老师），不展示认领申请的联系方式 */
  router.get('/', (req, res) => {
    const session = getSession(req);
    const isAdmin = session?.role === 'admin';
    const items = readItems().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // 管理员视图带认领申请列表；公开视图隐藏联系方式
    const list = items.map((item) => {
      if (isAdmin) {
        return {
          ...item,
          claims: Array.isArray(item.claims) ? item.claims : [],
        };
      }
      return {
        id: item.id,
        name: item.name || '',
        description: item.description || '',
        location: item.location || '',
        image: item.image || '',
        status: item.status || '待认领',
        createdAt: item.createdAt || '',
        claimCount: Array.isArray(item.claims) ? item.claims.length : 0,
      };
    });
    return res.json(list);
  });

  /** 管理员发布拾获物品：名称、描述、拾获地点、照片 */
  router.post('/', upload.single('image'), (req, res) => {
    if (!isAdminReq(req)) {
      return res.status(403).json({ error: '仅限管理员操作' });
    }
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const location = String(req.body?.location || '').trim();

    if (!name) return res.status(400).json({ error: '请填写物品名称' });
    if (!req.file) return res.status(400).json({ error: '请上传物品照片' });

    const items = readItems();
    const item = {
      id: uuidv4(),
      name,
      description,
      location,
      image: `/uploads/${req.file.filename}`,
      status: '待认领',
      createdAt: new Date().toISOString(),
      claims: [],
    };
    items.unshift(item);
    writeItems(items);
    return res.status(201).json(item);
  });

  /** 管理员更新物品状态（如标记已认领）或删除物品 */
  /** 生成 6 位数字认领密码：学生凭此码到管理员处领取，管理员核验通过才能标记已认领 */
  const makeClaimCode = () =>
    String(Math.floor(100000 + Math.random() * 900000));

  router.patch('/:id', (req, res) => {
    if (!isAdminReq(req)) {
      return res.status(403).json({ error: '仅限管理员操作' });
    }
    const items = readItems();
    const index = items.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: '未找到该物品' });

    const status = String(req.body?.status || '').trim();
    if (status === '已认领') {
      // 标记已认领必须校验认领密码：防止冒领，密码由学生申请认领时获得
      const claimCode = String(req.body?.claimCode || '').trim();
      if (!claimCode) {
        return res.status(400).json({ error: '请输入认领密码' });
      }
      const claims = Array.isArray(items[index].claims) ? items[index].claims : [];
      const matched = claims.find((claim) => String(claim.claimCode || '') === claimCode);
      if (!matched) {
        return res.status(400).json({ error: '认领密码不正确，认领失败' });
      }
      // 记录最终认领人，便于追溯
      items[index].claimedBy = matched.name;
      items[index].claimedContact = matched.contact;
    }
    if (status) {
      items[index].status = status;
    }
    writeItems(items);
    return res.json(items[index]);
  });

  /** 管理员删除物品：同时清理图片文件 */
  router.delete('/:id', (req, res) => {
    if (!isAdminReq(req)) {
      return res.status(403).json({ error: '仅限管理员操作' });
    }
    const items = readItems();
    const index = items.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: '未找到该物品' });

    const [removed] = items.splice(index, 1);
    writeItems(items);
    deleteImageFile(removed.image);
    return res.json({ success: true, message: '物品已删除' });
  });

  /** 师生申请取回：填写姓名、联系方式、认领说明 */
  router.post('/:id/claim', (req, res) => {
    const items = readItems();
    const index = items.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: '未找到该物品' });

    const target = items[index];
    if (target.status === '已认领') {
      return res.status(400).json({ error: '该物品已被认领，如有疑问请联系管理员' });
    }

    const name = String(req.body?.name || '').trim();
    const contact = String(req.body?.contact || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!name) return res.status(400).json({ error: '请填写您的姓名' });
    if (!contact) return res.status(400).json({ error: '请填写联系方式' });
    if (!/^[0-9]{11}$/.test(contact)) return res.status(400).json({ error: '联系方式请填写 11 位手机号' });

    target.claims = Array.isArray(target.claims) ? target.claims : [];
    const claimCode = makeClaimCode();
    target.claims.push({
      id: uuidv4(),
      name,
      contact,
      message,
      claimCode,
      createdAt: new Date().toISOString(),
    });
    writeItems(items);
    // 认领密码仅在申请成功时返回给申请人一次，管理员视图也不展示，需学生领取时当面提供
    return res.json({
      success: true,
      message: '申请已提交，请牢记以下认领密码，领取时需向管理员出示',
      claimCode,
    });
  });

  return { router };
};
