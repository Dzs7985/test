export const initialForm = {
  name: '',
  campus: '',
  // 各模块的地点字段，按 locationMode 使用其中一部分：
  // 宿舍/教室/办公室 → building + roomNumber；实验室 → building + lab；食堂 → canteen + floor；其余 → location
  building: '',
  roomNumber: '',
  lab: '',
  canteen: '',
  floor: '',
  location: '',
  category: '',
  description: '',
  contact: '',
};

export const defaultCampusOptions = ['南校区', '北校区'];
export const defaultBuildingOptions = ['1号楼', '2号楼', '3号楼', '4号楼'];

/** 默认报修模块（配置缺失时的兜底；修改时同步 server/modules.js 的 DEFAULT_MODULES） */
export const defaultModules = [
  { id: 'dorm', name: '宿舍报修', enabled: true, locationMode: 'building' },
  { id: 'lab', name: '实验室报修', enabled: true, locationMode: 'lab' },
  { id: 'canteen', name: '食堂报修', enabled: true, locationMode: 'canteen' },
  { id: 'classroom', name: '教室报修', enabled: true, locationMode: 'room' },
  { id: 'office', name: '办公室报修', enabled: true, locationMode: 'room' },
];

export const repairCategories = ['水电', '网络', '门窗', '空调', '家具', '其他'];

/** 工单状态两态：未完成（提交后，历史「维修中」也归入其中）→ 已完成 */
export const REPAIR_STATUS_PENDING = '未完成';
export const REPAIR_STATUS_DONE = '已完成';

/** 与服务端 repairsRoutes.js 的 LEGACY_STATUS 对应：历史数据「待处理 / 已处理 / 维修中」的展示归一化 */
const LEGACY_REPAIR_STATUS = {
  待处理: REPAIR_STATUS_PENDING,
  已处理: REPAIR_STATUS_DONE,
  维修中: REPAIR_STATUS_PENDING,
};

export const normalizeRepairStatus = (status) =>
  LEGACY_REPAIR_STATUS[status] || status || REPAIR_STATUS_PENDING;

export const isRepairDone = (status) => normalizeRepairStatus(status) === REPAIR_STATUS_DONE;

/** 状态徽章配色：与 repairs.css 的 .status.pending / .done 一一对应 */
export const REPAIR_STATUS_CLASS = {
  [REPAIR_STATUS_PENDING]: 'pending',
  [REPAIR_STATUS_DONE]: 'done',
};

export const MAX_LOGIN_ATTEMPTS = 5;

/** 与服务端 managerRoutes.js 的 INITIAL_PASSWORD 保持一致：一键生成楼号时新建账号的初始密码 */
export const DEFAULT_INITIAL_PASSWORD = '12345678';

export const getDefaultConfig = () => ({
  campuses: defaultCampusOptions,
  buildings: defaultBuildingOptions,
});

export const sanitizeAlphaNumeric = (value) => (value || '').replace(/[^A-Za-z0-9]/g, '');

export const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('zh-CN');
};