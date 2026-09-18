export const initialForm = {
  name: '',
  campus: '',
  building: '',
  roomNumber: '',
  category: '',
  description: '',
  contact: '',
};

export const defaultCampusOptions = ['南校区', '北校区'];
export const defaultBuildingOptions = ['1号楼', '2号楼', '3号楼', '4号楼'];

export const repairCategories = ['水电', '网络', '门窗', '空调', '家具', '其他'];

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