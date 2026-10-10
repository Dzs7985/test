import { defaultModules } from './constants';

/** 宿舍模块的固定 id：不可删除，locationMode 恒为 building */
export const DORM_MODULE_ID = 'dorm';

/** 存量工单没有 module 字段，一律按宿舍报修处理 */
export const moduleIdOf = (record) => record?.module || DORM_MODULE_ID;

export const findModule = (config, id) => (config?.modules || defaultModules).find((item) => item.id === id);

/** 学生入口只展示启用的模块 */
export const enabledModules = (config) => (config?.modules || defaultModules).filter((item) => item.enabled);

/** 新增模块的 id：与名称解耦（重命名后 id 必须保持稳定），因此不能用中文名直接当 id */
export const newModuleId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;