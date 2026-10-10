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

export const repairCategories = ['水电', '网络', '门窗', '空调', '家具', '其他'];

/**
 * 报修模块默认值：数组顺序即学生入口的展示顺序。
 * 与服务端 server/modules.js 的 DEFAULT_MODULES 保持一致；
 * locationMode 决定学生表单的地点字段：'building' 按校区/楼号/房间号分派宿管，
 * 'lab' 填楼号 + 实验室，'canteen' 填食堂 + 层号，'room' 填楼号 + 房间号，
 * 'custom' 填具体地点（仅管理员可见）。地点选项由管理员在「模块管理 → 地点设置」维护。
 */
export const defaultModules = [
  { id: 'dorm', name: '宿舍报修', enabled: true, locationMode: 'building' },
  { id: 'lab', name: '实验室报修', enabled: true, locationMode: 'lab' },
  { id: 'canteen', name: '食堂报修', enabled: true, locationMode: 'canteen' },
  { id: 'classroom', name: '教室报修', enabled: true, locationMode: 'room' },
  { id: 'office', name: '办公室报修', enabled: true, locationMode: 'room' },
];

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