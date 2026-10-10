import { DORM_MODULE_ID } from './modules';

/**
 * 各模块「地点」选项的统一读取与展示规则（学生表单、管理端、工单看板共用）。
 * 宿舍楼号存在 config.campusBuildings；其他模块存在 config.moduleLocations[模块 id]：
 * 楼号 / 食堂 / 层号 / 自定义模块的楼层按校区维护
 * （campusBuildings / campusCanteens / campusFloors），
 * 实验室名称、房间号再按「校区 → 楼号」细分（campusLabs / campusRooms）。
 */

/** 该模块按校区维护的地点列表（宿舍 → 楼号；实验室/教室/办公室 → 楼号；食堂 → 食堂；自定义模块 → 楼层） */
export const campusListOf = (config, moduleId, campus) => {
  if (!campus) return [];
  if (moduleId === DORM_MODULE_ID) return config?.campusBuildings?.[campus] || [];
  const location = config?.moduleLocations?.[moduleId] || {};
  const perCampus = location.campusBuildings || location.campusCanteens || location.campusFloors || {};
  return perCampus[campus] || [];
};

/** 该模块某个「按校区维护」字段的列表（如食堂报修的层号 campusFloors） */
export const campusFieldListOf = (config, moduleId, field, campus) =>
  (campus && config?.moduleLocations?.[moduleId]?.[field]?.[campus]) || [];

/** 该模块某个「按校区 → 楼号维护」字段的列表（如实验室名称 campusLabs、房间号 campusRooms） */
export const buildingFieldListOf = (config, moduleId, field, campus, building) =>
  (campus && building && config?.moduleLocations?.[moduleId]?.[field]?.[campus]?.[building]) || [];

/**
 * 工单地点文本：食堂 → 食堂/层号；自定义模块 → 楼层/具体地点；
 * 实验室 → 楼号/实验室；其余模块 → 具体地点；
 * 宿舍/教室/办公室 → 楼号/房间号（存量工单没有新字段，自动落到这一支）。
 */
export const formatRepairLocation = (record) => {
  if (!record) return '';
  const detail = record.canteen
    ? [record.canteen, record.floor]
    : record.location
      ? [record.floor, record.location]
      : record.lab
        ? [record.building, record.lab]
        : [record.building, record.roomNumber];
  return [record.campus, ...detail].filter(Boolean).join(' / ');
};