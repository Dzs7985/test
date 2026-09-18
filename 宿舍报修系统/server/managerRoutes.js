import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readManagers, writeManagers } from './managerStore.js';
import { isAlnum } from './validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFile = path.join(__dirname, 'data', 'managers_changes.log');

/** 新账号统一使用的默认初始密码，宿管拿到账号即可登录；管理员可在账号面板里逐个修改。 */
export const INITIAL_PASSWORD = '12345678';

const appendLog = (text) => {
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${text}\n`, 'utf8');
  } catch (err) {
    console.error('写入 managers_changes.log 失败', err);
  }
};

/**
 * 宿管账号接口（仅管理员可操作）。全部按校区作用域化：
 * 账号数据按校区分开存储，接口必须带上 campus，因此不同校区可以存在同名账号。
 */
export const createManagerRoutes = ({ isAdminReq, readConfig, dropSessionsOf }) => {
  const router = express.Router();

  /** 从 query 取校区；缺失时直接回 400，避免误操作到别的校区。 */
  const requireCampus = (req, res) => {
    const campus = String(req.query.campus || '').trim();
    if (!campus) {
      res.status(400).json({ error: '缺少校区参数' });
      return '';
    }
    return campus;
  };

  router.get('/', (req, res) => {
    if (!isAdminReq(req)) return res.status(403).json({ error: '仅限管理员查看' });
    const campus = requireCampus(req, res);
    if (!campus) return undefined;
    return res.json(readManagers(campus));
  });

  router.post('/', (req, res) => {
    if (!isAdminReq(req)) return res.status(403).json({ error: '仅限管理员操作' });
    const { username, campus, building } = req.body || {};
    if (!username) return res.status(400).json({ error: '用户名不能为空' });
    if (!isAlnum(username)) {
      return res.status(400).json({ error: '用户名和密码仅允许字母与数字' });
    }
    // 新建账号一律使用默认初始密码，密码的个性化修改走 PATCH /:username
    const initialPassword = INITIAL_PASSWORD;

    const chosenCampus = String(campus || '').trim();
    if (!chosenCampus) return res.status(400).json({ error: '请先选择校区' });
    if (!readConfig().campuses.includes(chosenCampus)) {
      return res.status(400).json({ error: '校区不存在' });
    }

    const list = readManagers(chosenCampus);
    // 用户名只在本校区内唯一，不同校区可以重名
    if (list.some((item) => item.username === username)) {
      return res.status(409).json({ error: '本校区已存在同名账号' });
    }
    // 楼号与宿管账号为 1:1 绑定，避免一个楼号出现两个账号
    const boundBuilding = building ? String(building).trim() : '';
    if (boundBuilding && list.some((item) => item.building === boundBuilding)) {
      return res.status(409).json({ error: '该楼号已绑定宿管账号' });
    }

    list.push({ username, password: initialPassword, campus: chosenCampus, building: boundBuilding });
    writeManagers(chosenCampus, list);
    appendLog(`CREATE campus=${chosenCampus} username=${username} building=${boundBuilding}`);
    return res.status(201).json({
      success: true,
      username,
      password: initialPassword,
      campus: chosenCampus,
      building: boundBuilding,
    });
  });

  router.delete('/:username', (req, res) => {
    if (!isAdminReq(req)) return res.status(403).json({ error: '仅限管理员操作' });
    const campus = requireCampus(req, res);
    if (!campus) return undefined;

    const list = readManagers(campus);
    const index = list.findIndex((item) => item.username === req.params.username);
    if (index === -1) return res.status(404).json({ error: '未找到该宿管账号' });

    const removed = list.splice(index, 1)[0];
    writeManagers(campus, list);
    dropSessionsOf(campus, removed.username);
    appendLog(`DELETE campus=${campus} username=${removed.username}`);
    return res.json({ success: true });
  });

  router.patch('/:username', (req, res) => {
    if (!isAdminReq(req)) return res.status(403).json({ error: '仅限管理员操作' });
    const campus = requireCampus(req, res);
    if (!campus) return undefined;

    const username = req.params.username;
    const { password, newUsername, building } = req.body || {};
    if (!password && !newUsername && building === undefined) {
      return res.status(400).json({ error: '请输入要更新的用户名、密码或楼号' });
    }
    if (password && !isAlnum(password)) {
      return res.status(400).json({ error: '用户名和密码仅允许字母与数字' });
    }
    if (newUsername && !isAlnum(newUsername)) {
      return res.status(400).json({ error: '用户名和密码仅允许字母与数字' });
    }

    const list = readManagers(campus);
    const index = list.findIndex((item) => item.username === username);
    if (index === -1) return res.status(404).json({ error: '未找到该宿管账号' });

    let student = list[index];

    if (newUsername && newUsername !== username) {
      if (list.some((item) => item.username === newUsername)) {
        return res.status(409).json({ error: '本校区已存在同名账号' });
      }
      student.username = newUsername;
      appendLog(`RENAME campus=${campus} from=${username} to=${newUsername}`);
    }

    if (password) {
      student.password = password;
      appendLog(`UPDATE PASSWORD campus=${campus} username=${student.username}`);
    }

    if (building !== undefined) {
      const target = String(building || '').trim();
      if (target && list.some((item, i) => i !== index && item.building === target)) {
        return res.status(409).json({ error: '该楼号已绑定宿管账号' });
      }
      if (target !== (student.building || '')) {
        student.building = target;
        appendLog(`BIND BUILDING campus=${campus} username=${student.username} building=${target}`);
      }
    }

    writeManagers(campus, list);
    // 改名或改密后，让旧的登录态立即失效
    if (password || student.username !== username) dropSessionsOf(campus, username);
    return res.json({ success: true, campus, username: student.username, building: student.building || '' });
  });

  return router;
};