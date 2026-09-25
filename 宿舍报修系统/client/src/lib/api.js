import { defaultCampusOptions, defaultBuildingOptions } from './constants';

const readJson = async (res, fallback = {}) => res.json().catch(() => fallback);

const jsonHeaders = (extra = {}) => ({ 'Content-Type': 'application/json', ...extra });

const tokenHeaders = (token, extra = {}) => ({ 'x-admin-token': token || '', ...extra });

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
  return { campuses, buildings: fallbackBuildings, campusBuildings, emergencyPhone: String(data.emergencyPhone || '') };
};

/** campus 为空时表示管理员登录（管理员是全局账号）。role 为 'student' 时走学生账号通道。 */
export const login = async (username, password, campus, role) => {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ username, password, campus: campus || '', role: role || undefined }),
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

/** 更新工单状态：action='start' 开始维修（→维修中），'finish' 标记完成（→已完成） */
export const updateRepairStatus = async (repairId, action, token) => {
  const res = await fetch(`/api/repairs/${repairId}`, {
    method: 'PATCH',
    headers: tokenHeaders(token, jsonHeaders()),
    body: JSON.stringify({ action }),
  });
  return { ok: res.ok, data: await readJson(res) };
};

/** 学生查询自己的报修：姓名 + 联系方式精确匹配，后端按学生登录态鉴权 */
export const fetchMyRepairs = async (name, contact, token) => {
  const query = `name=${encodeURIComponent(name)}&contact=${encodeURIComponent(contact)}`;
  const res = await fetch(`/api/my-repairs?${query}`, { headers: tokenHeaders(token) });
  return { ok: res.ok, status: res.status, data: await readJson(res, []) };
};

export const deleteRepair = async (repairId, token) => {
  const res = await fetch(`/api/repairs/${repairId}`, {
    method: 'DELETE',
    headers: tokenHeaders(token),
  });
  return { ok: res.ok, data: await readJson(res) };
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

export const submitRepair = async (formData, token) => {
  const res = await fetch('/api/repairs', {
    method: 'POST',
    headers: tokenHeaders(token),
    body: formData,
  });
  return { ok: res.ok, status: res.status, data: await readJson(res) };
};