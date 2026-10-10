/**
 * 报修模块：学生入口的报修类型列表（宿舍、实验室、食堂…）。
 * 存在 config.json 的 modules 数组里，数组顺序即学生入口的展示顺序；
 * 未启用的模块在读取时统一排到最后（刷新页面后自动下沉，不写改文件的顺序）。
 * locationMode 决定学生表单的地点字段（选项由 config.json 的 moduleLocations 维护）：
 *   building → 校区 + 楼号 + 房间号，分派给楼号宿管；lab → 校区 + 楼号 + 实验室；
 *   canteen → 校区 + 食堂 + 层号；room → 校区 + 楼号 + 房间号（仅管理员可见）；
 *   custom → 校区 + 具体地点（仅管理员可见）。
 */

/** 宿舍模块的固定 id：不可删除，且 locationMode 恒为 building */
export const DORM_MODULE_ID = 'dorm';

/** 默认模块（配置缺失或全部非法时兜底）。修改时同步 client/src/lib/constants.js 的 defaultModules */
export const DEFAULT_MODULES = [
  { id: DORM_MODULE_ID, name: '宿舍报修', enabled: true, locationMode: 'building' },
  { id: 'lab', name: '实验室报修', enabled: true, locationMode: 'lab' },
  { id: 'canteen', name: '食堂报修', enabled: true, locationMode: 'canteen' },
  { id: 'classroom', name: '教室报修', enabled: true, locationMode: 'room' },
  { id: 'office', name: '办公室报修', enabled: true, locationMode: 'room' },
];

const LOCATION_MODES = ['building', 'lab', 'canteen', 'room', 'custom'];

/** 内置模块的地点模式固定（老配置里实验室/食堂等为 custom，读盘时按 id 迁移） */
const BUILTIN_LOCATION_MODES = {
  dorm: 'building',
  lab: 'lab',
  canteen: 'canteen',
  classroom: 'room',
  office: 'room',
};

const isValidModule = (item) =>
  Boolean(item) &&
  typeof item === 'object' &&
  typeof item.id === 'string' &&
  item.id.trim() !== '' &&
  typeof item.name === 'string' &&
  item.name.trim() !== '' &&
  typeof item.enabled === 'boolean' &&
  LOCATION_MODES.includes(item.locationMode);

/** 规范化单个模块：内置模块的地点模式固定（宿舍恒为 building），其余保持提交值 */
const toModule = (item) => {
  const id = item.id.trim();
  return {
    id,
    name: item.name.trim(),
    enabled: item.enabled,
    locationMode: BUILTIN_LOCATION_MODES[id] || item.locationMode,
  };
};

/** 未启用的模块统一沉到列表最后（启用与未启用的相对顺序各自保持不变） */
const enabledFirst = (modules) => [
  ...modules.filter((item) => item.enabled),
  ...modules.filter((item) => !item.enabled),
];

/** 读盘兜底：过滤非法项、按 id 去重、确保宿舍模块始终存在、未启用的排到最后；没有任何合法项时回退默认模块副本 */
export const normalizeModules = (raw) => {
  const list = Array.isArray(raw) ? raw.filter(isValidModule) : [];
  const seen = new Set();
  const modules = [];
  list.forEach((item) => {
    const next = toModule(item);
    if (seen.has(next.id)) return;
    seen.add(next.id);
    modules.push(next);
  });
  if (!modules.length) return DEFAULT_MODULES.map((item) => ({ ...item }));
  if (!seen.has(DORM_MODULE_ID)) modules.unshift({ ...DEFAULT_MODULES[0] });
  return enabledFirst(modules);
};

/** 写入校验：返回 { error } 或 { modules }；缺少宿舍模块视为「试图删除宿舍报修模块」 */
export const validateModules = (raw) => {
  if (!Array.isArray(raw) || !raw.every(isValidModule)) {
    return { error: '报修模块配置格式不正确' };
  }
  const ids = raw.map((item) => item.id.trim());
  const names = raw.map((item) => item.name.trim());
  if (new Set(ids).size !== ids.length) return { error: '报修模块 id 重复' };
  if (new Set(names).size !== names.length) return { error: '报修模块名称重复' };
  if (!ids.includes(DORM_MODULE_ID)) return { error: '宿舍报修模块不可删除' };
  return { modules: raw.map(toModule) };
};

export const findModule = (config, id) => (config?.modules || []).find((item) => item.id === id);