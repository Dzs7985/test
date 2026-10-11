﻿﻿﻿import { defaultCampusOptions, defaultBuildingOptions, defaultModules } from './constants';
import { DORM_MODULE_ID } from './modules';

const readJson = async (res, fallback = {}) => res.json().catch(() => fallback);

const jsonHeaders = (extra = {}) => ({ 'Content-Type': 'application/json', ...extra });

const tokenHeaders = (token, extra = {}) => ({ 'x-admin-token': token || '', ...extra });

/** 内置模块的地点模式固定（与服务端 server/modules.js 的 BUILTIN_LOCATION_MODES 保持一致） */
const BUILTIN_LOCATION_MODES = {
  dorm: 'building',
  lab: 'lab',
  canteen: 'canteen',
  classroom: 'room',
  office: 'room',
};
const LOCATION_MODES = ['building', 'lab', 'canteen', 'room', 'custom'];

const stringList = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];

/**
 * 各模块地点选项的结构化兜底：服务端已按「缺键补默认值」规范化过，
 * 这里只保证形状正确（按当前校区对齐一层键、按该模块的楼号对齐二层键），避免异常数据把表单打崩。
 * modules 用于识别自定义模块（locationMode === 'custom'）：它们只有按校区维护的楼层。
 */
const normalizeModuleLocations = (raw, campuses, modules) => {
  const source = raw && typeof raw === 'object' ? raw : {};
  const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  /** 按校区维护的列表 → 保证每个校区都有键 */
  const campusMap = (value) => {
    const map = asObject(value);
    const next = {};
    campuses.forEach((campus) => {
      next[campus] = stringList(map[campus]);
    });
    return next;
  };
  /** 按「校区 → 楼号」维护的列表 → 用该模块的楼号列表保证二层键齐全 */
  const buildingMap = (value, campusBuildings) => {
    const map = asObject(value);
    const next = {};
    campuses.forEach((campus) => {
      const perCampus = asObject(map[campus]);
      const inner = {};
      (campusBuildings[campus] || []).forEach((building) => {
        inner[building] = stringList(perCampus[building]);
      });
      next[campus] = inner;
    });
    return next;
  };

  const labBuildings = campusMap(asObject(source.lab).campusBuildings);
  const classroomBuildings = campusMap(asObject(source.classroom).campusBuildings);
  const officeBuildings = campusMap(asObject(source.office).campusBuildings);
  const canteen = asObject(source.canteen);
  // 自定义模块（如「图书馆报修」）：只有按校区维护的楼层；缺键为空数组（学生端回退为自行填写）
  const customLocations = {};
  (modules || []).forEach((item) => {
    if (item.locationMode !== 'custom') return;
    customLocations[item.id] = { campusFloors: campusMap(asObject(source[item.id]).campusFloors) };
  });
  return {
    lab: {
      campusBuildings: labBuildings,
      campusLabs: buildingMap(asObject(source.lab).campusLabs, labBuildings),
    },
    canteen: {
      campusCanteens: campusMap(canteen.campusCanteens),
      campusFloors: campusMap(canteen.campusFloors),
    },
    classroom: {
      campusBuildings: classroomBuildings,
      campusRooms: buildingMap(asObject(source.classroom).campusRooms, classroomBuildings),
    },
    office: {
      campusBuildings: officeBuildings,
      campusRooms: buildingMap(asObject(source.office).campusRooms, officeBuildings),
    },
    ...customLocations,
  };
};

export const normalizeConfig = (data) => {
  if (!data) return null;
  const campuses = Array.isArray(data.campuses) ? data.campuses : defaultCampusOptions;
  const rawCampusBuildings = data.campusBuildings && typeof data.campusBuildings === 'object' ? data.campusBuildings : {};
  const fallbackBuildings = Array.isArray(data.buildings) ? data.buildings : defaultBuildingOptions;
  const campusBuildings = {};
  campuses.forEach((campus) => {
    campusBuildings[campus] = Array.isArray(rawCampusBuildings[campus])
      ? rawCampusBuildings[campus]
      : fallbackBuildings;
  });
  // emergencyPhone 用于登录页「忘记密码」提示，未设置时为空串
  // modules 为学生入口的报修模块：过滤非法项、内置模块的地点模式固定
  const rawModules = Array.isArray(data.modules) ? data.modules : defaultModules;
  const modules = rawModules
    .filter(
      (item) =>
        item && typeof item.id === 'string' && item.id.trim() && typeof item.name === 'string' && item.name.trim(),
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      enabled: item.enabled !== false,
      locationMode: BUILTIN_LOCATION_MODES[item.id] || (LOCATION_MODES.includes(item.locationMode) ? item.locationMode : 'custom'),
    }));
  if (!modules.length) modules.push(...defaultModules.map((item) => ({ ...item })));
  if (!modules.some((item) => item.id === DORM_MODULE_ID)) modules.unshift({ ...defaultModules[0] });

  return {
    campuses,
    buildings: fallbackBuildings,
    campusBuildings,
    emergencyPhone: String(data.emergencyPhone || ''),
    modules,
    // 各模块「具体地点」的选项（宿舍楼号在 campusBuildings；实验室/食堂/教室/办公室、自定义模块见此处）
    moduleLocations: normalizeModuleLocations(data.moduleLocations, campuses, modules),
  };
};

/** campus 为空时表示管理员登录（管理员是全局账号）。 */
export const login = async (username, password, campus) => {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password, campus: campus || '' }),
  });
  return { ok: res.ok, data: await readJson(res) };
};

export const fetchConfig = async () => {
  const res = await fetch('/api/config');
  if (!res.ok) return null;
  return normalizeConfig(await readJson(res, null));
};

export const saveConfig = async (config, token) => {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: tokenHeaders(token, jsonHeaders()),
    body: JSON.stringify(config),
  });
  return { ok: res.ok, data: await readJson(res) };
};

/** 账号数据按校区独立存储，因此读写都要带上 campus。 */
export const fetchManagers = async (campus, token) => {
  const res = await fetch(`/api/managers?campus=${encodeURIComponent(campus)}`, { headers: tokenHeaders(token) });
  return { ok: res.ok, status: res.status, data: await readJson(res, []) };
};

export const createManager = async (payload, token) => {
  const res = await fetch('/api/managers', {
    method: 'POST',
    headers: tokenHeaders(token, jsonHeaders()),
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, data: await readJson(res) };
};

export const updateManager = async (campus, username, body, token) => {
  const res = await fetch(`/api/managers/${encodeURIComponent(username)}?campus=${encodeURIComponent(campus)}`, {
    method: 'PATCH',
    headers: tokenHeaders(token, jsonHeaders()),
    body: JSON.stringify(body),
  });
  return { ok: res.ok, data: await readJson(res) };
};

export const deleteManager = async (campus, username, token) => {
  const res = await fetch(`/api/managers/${encodeURIComponent(username)}?campus=${encodeURIComponent(campus)}`, {
    method: 'DELETE',
    headers: tokenHeaders(token),
  });
  return { ok: res.ok, data: await readJson(res) };
};

export const fetchRepairs = async (token) => {
  const res = await fetch('/api/repairs', { headers: tokenHeaders(token) });
  return { ok: res.ok, status: res.status, data: await readJson(res, []) };
};

export const markRepairHandled = async (repairId, token, feedback) => {
  const res = await fetch(`/api/repairs/${repairId}`, {
    method: 'PATCH',
    headers: tokenHeaders(token, jsonHeaders()),
    body: JSON.stringify({ feedback: feedback || '' }),
  });
  return { ok: res.ok, data: await readJson(res) };
};

export const deleteRepair = async (repairId, token) => {
  const res = await fetch(`/api/repairs/${repairId}`, {
    method: 'DELETE',
    headers: tokenHeaders(token),
  });
  return { ok: res.ok, data: await readJson(res) };
};

/** 回收站（仅管理员）：查看条目、恢复、调整保留天数；条目不可手动删除，到期自动清理。 */
export const fetchTrash = async (token) => {
  const res = await fetch('/api/trash', { headers: tokenHeaders(token) });
  return { ok: res.ok, status: res.status, data: await readJson(res, { retentionDays: 7, items: [] }) };
};

export const restoreTrashItem = async (itemId, token) => {
  const res = await fetch(`/api/trash/${encodeURIComponent(itemId)}/restore`, {
    method: 'POST',
    headers: tokenHeaders(token),
  });
  return { ok: res.ok, data: await readJson(res) };
};

export const saveTrashRetention = async (retentionDays, token) => {
  const res = await fetch('/api/trash', {
    method: 'PATCH',
    headers: tokenHeaders(token, jsonHeaders()),
    body: JSON.stringify({ retentionDays }),
  });
  return { ok: res.ok, data: await readJson(res) };
};

/** 学生自助查询（无需登录）：查询码 / 提交时填写的手机号两种方式，以及追评反馈。 */
export const queryRepairByCode = async (code) => {
  const res = await fetch(`/api/repairs/query?code=${encodeURIComponent(code)}`);
  return { ok: res.ok, data: await readJson(res, {}) };
};

export const queryRepairsByContact = async (contact) => {
  const res = await fetch('/api/repairs/query', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ contact }),
  });
  return { ok: res.ok, data: await readJson(res, []) };
};

export const submitRepairFollowUp = async (payload) => {
  const res = await fetch('/api/repairs/query/follow-up', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, data: await readJson(res, {}) };
};

/** 修改当前登录账号（管理员或宿管本人）的密码，需要提供原密码。 */
export const changeOwnPassword = async (oldPassword, newPassword, token) => {
  const res = await fetch('/api/me/password', {
    method: 'PATCH',
    headers: tokenHeaders(token, jsonHeaders()),
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  return { ok: res.ok, data: await readJson(res) };
};

export const submitRepair = async (formData) => {
  const res = await fetch('/api/repairs', { method: 'POST', body: formData });
  return { ok: res.ok, data: await readJson(res) };
};

/* ===================== 失物招领 ===================== */

/** 公开列表：师生可直接浏览，无需登录 */
export const fetchLostItems = async (token) => {
  const headers = token ? tokenHeaders(token) : {};
  const res = await fetch('/api/lost-items', { headers });
  return { ok: res.ok, data: await readJson(res, []) };
};

/** 管理员发布拾获物品（带照片） */
export const createLostItem = async (formData, token) => {
  const res = await fetch('/api/lost-items', {
    method: 'POST',
    headers: tokenHeaders(token),
    body: formData,
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
};

/** 管理员更新物品状态（待认领 / 已认领）；标记已认领需携带学生认领密码 claimCode */
export const updateLostItemStatus = async (id, status, token, claimCode) => {
  const body = { status };
  if (claimCode) body.claimCode = claimCode;
  const res = await fetch(`/api/lost-items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: tokenHeaders(token, jsonHeaders()),
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
};

/** 管理员删除物品 */
export const deleteLostItem = async (id, token) => {
  const res = await fetch(`/api/lost-items/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: tokenHeaders(token),
  });
  return { ok: res.ok, data: await readJson(res) };
};

/** 师生申请取回：姓名、11 位手机号、认领说明 */
export const claimLostItem = async (id, payload) => {
  const res = await fetch(`/api/lost-items/${encodeURIComponent(id)}/claim`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
};