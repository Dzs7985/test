import { readManagers, writeManagers } from '../managerStore.js';

/** 地点选项字段 → 展示名称（用于回收站条目文案） */
const FIELD_LABELS = {
  campusCanteens: '食堂',
  campusLabs: '实验室名称',
  campusRooms: '房间号',
};

const listOf = (map, campus) => (Array.isArray(map?.[campus]) ? map[campus] : []);

/**
 * 配置类删除的回收站桥接：
 * 1. capture：管理员保存配置（POST /api/config）时，对比新旧配置，把「消失的内容」
 *    （整校区、模块、楼号、地点选项）打包成回收站条目；
 * 2. captureManagerDeletion：宿管账号被删除时打包条目；
 * 3. restoreHandlers：条目恢复时把数据写回当前配置（按类型分派，逐项校验前置条件）。
 */
export const createConfigTrash = ({ readConfig, writeConfig }) => {
  /** 地点选项的展示名：宿舍楼号为「宿舍楼号」，食堂模块的 campusFloors 为「层号」，自定义模块为「楼层」 */
  const fieldLabel = (module, group) => {
    if (group === 'campusBuildings') return '楼号';
    if (group === 'campusFloors') return module?.locationMode === 'canteen' ? '层号' : '楼层';
    return FIELD_LABELS[group] || '地点选项';
  };

  const capture = (existing, next, { actor, renames = [] } = {}) => {
    const entries = [];
    const push = (type, label, payload) => entries.push({ type, label, payload, deletedBy: actor || 'admin' });
    const renamedFrom = new Set(renames.map((item) => item.from));

    // 整校区删除（改名不算）：连带收集该校区的楼号、各模块地点配置与全部宿管账号
    const removedCampuses = existing.campuses.filter(
      (campus) => !next.campuses.includes(campus) && !renamedFrom.has(campus),
    );
    removedCampuses.forEach((campus) => {
      const locations = {};
      Object.entries(existing.moduleLocations || {}).forEach(([moduleId, config]) => {
        const slice = {};
        Object.entries(config || {}).forEach(([group, value]) => {
          if (value && typeof value === 'object' && value[campus] !== undefined) slice[group] = value[campus];
        });
        if (Object.keys(slice).length) locations[moduleId] = slice;
      });
      push('campus', `校区「${campus}」`, {
        name: campus,
        campusBuildings: listOf(existing.campusBuildings, campus),
        locations,
        accounts: readManagers(campus),
      });
    });

    // 模块删除：连带该模块的全部地点配置
    existing.modules
      .filter((mod) => !next.modules.some((item) => item.id === mod.id))
      .forEach((mod) => {
        push('module', `模块「${mod.name}」`, { module: mod, locations: existing.moduleLocations?.[mod.id] || null });
      });

    const keptCampuses = existing.campuses.filter((campus) => next.campuses.includes(campus));

    // 宿舍楼号删除（顶层 campusBuildings）
    keptCampuses.forEach((campus) => {
      const before = listOf(existing.campusBuildings, campus);
      const after = listOf(next.campusBuildings, campus);
      before
        .filter((building) => !after.includes(building))
        .forEach((building) =>
          push('option', `宿舍楼号「${campus} / ${building}」`, {
            moduleId: '',
            group: 'campusBuildings',
            campus,
            value: building,
          }),
        );
    });

    // 其余模块的地点选项删除：按校区（或校区→楼号）逐层对比
    existing.modules
      .filter((mod) => next.modules.some((item) => item.id === mod.id))
      .forEach((mod) => {
        const before = existing.moduleLocations?.[mod.id] || {};
        const after = next.moduleLocations?.[mod.id] || {};
        Object.keys(before).forEach((group) => {
          const isBuildingScoped = group === 'campusLabs' || group === 'campusRooms';
          const label = fieldLabel(mod, group);
          keptCampuses.forEach((campus) => {
            if (!isBuildingScoped) {
              const oldList = listOf(before[group], campus);
              const newList = listOf(after[group], campus);
              oldList
                .filter((value) => !newList.includes(value))
                .forEach((value) =>
                  push('option', `${mod.name} · ${label}「${campus} / ${value}」`, {
                    moduleId: mod.id,
                    group,
                    campus,
                    value,
                  }),
                );
              return;
            }
            const oldBuildings = before[group]?.[campus] || {};
            const newBuildings = after[group]?.[campus] || {};
            Object.keys(oldBuildings).forEach((building) => {
              oldBuildings[building]
                .filter((value) => !(newBuildings[building] || []).includes(value))
                .forEach((value) =>
                  push('option', `${mod.name} · ${label}「${campus} / ${building} / ${value}」`, {
                    moduleId: mod.id,
                    group,
                    campus,
                    building,
                    value,
                  }),
                );
            });
          });
        });
      });

    return entries;
  };

  const captureManagerDeletion = (campus, account) => ({
    type: 'manager',
    label: `宿管账号「${account.username}」（${campus}${account.building ? ` · ${account.building}` : ''}）`,
    payload: { campus, account },
    deletedBy: 'admin',
  });

  const restoreCampus = (payload) => {
    const { name, campusBuildings = [], locations = {}, accounts = [] } = payload || {};
    const config = readConfig();
    if (!name) return { error: '条目数据不完整' };
    if (config.campuses.includes(name)) return { message: `校区「${name}」已存在，无需恢复` };

    const nextCampusBuildings = { ...config.campusBuildings, [name]: campusBuildings };
    const nextModuleLocations = { ...config.moduleLocations };
    Object.entries(locations).forEach(([moduleId, slice]) => {
      const target = { ...(nextModuleLocations[moduleId] || {}) };
      Object.entries(slice || {}).forEach(([group, value]) => {
        target[group] = { ...(target[group] || {}), [name]: value };
      });
      nextModuleLocations[moduleId] = target;
    });

    writeConfig({
      ...config,
      campuses: [...config.campuses, name],
      buildings: [...new Set(Object.values(nextCampusBuildings).flat())],
      campusBuildings: nextCampusBuildings,
      moduleLocations: nextModuleLocations,
    });
    // 校区被删除时账号文件也一并删除了，恢复校区时重建（账号密码为删除前的原密码）
    if (accounts.length) writeManagers(name, accounts);
    return { message: `校区「${name}」已恢复${accounts.length ? `，含 ${accounts.length} 个宿管账号` : ''}` };
  };

  const restoreModule = (payload) => {
    const { module: mod, locations } = payload || {};
    const config = readConfig();
    if (!mod?.id) return { error: '条目数据不完整' };
    if (config.modules.some((item) => item.id === mod.id)) return { message: `模块「${mod.name}」已存在，无需恢复` };
    const nextModuleLocations = { ...config.moduleLocations };
    if (locations) nextModuleLocations[mod.id] = locations;
    writeConfig({ ...config, modules: [...config.modules, mod], moduleLocations: nextModuleLocations });
    return { message: `模块「${mod.name}」已恢复` };
  };

  /** 楼号 / 地点选项恢复：按条目里的路径写回当前配置 */
  const restoreOption = (payload) => {
    const { moduleId, group, campus, building, value } = payload || {};
    const config = readConfig();
    if (!value) return { error: '条目数据不完整' };
    if (!config.campuses.includes(campus)) return { error: `校区「${campus}」不存在，请先恢复该校区` };

    if (!moduleId) {
      const list = listOf(config.campusBuildings, campus);
      if (list.includes(value)) return { message: '该楼号已存在，无需恢复' };
      const nextCampusBuildings = { ...config.campusBuildings, [campus]: [...list, value] };
      writeConfig({
        ...config,
        buildings: [...new Set(Object.values(nextCampusBuildings).flat())],
        campusBuildings: nextCampusBuildings,
      });
      return { message: `楼号「${campus} / ${value}」已恢复` };
    }

    const mod = config.modules.find((item) => item.id === moduleId);
    if (!mod) return { error: '所属模块已被删除，请先恢复该模块' };
    if (building && !listOf(config.moduleLocations?.[moduleId]?.campusBuildings, campus).includes(building)) {
      return { error: `楼号「${campus} / ${building}」不存在，请先恢复该楼号` };
    }

    const moduleLocations = { ...config.moduleLocations };
    const target = { ...(moduleLocations[moduleId] || {}) };
    if (building) {
      const perCampus = { ...(target[group]?.[campus] || {}) };
      const list = Array.isArray(perCampus[building]) ? perCampus[building] : [];
      if (list.includes(value)) return { message: '该选项已存在，无需恢复' };
      perCampus[building] = [...list, value];
      target[group] = { ...(target[group] || {}), [campus]: perCampus };
    } else {
      const list = listOf(target[group], campus);
      if (list.includes(value)) return { message: '该选项已存在，无需恢复' };
      target[group] = { ...(target[group] || {}), [campus]: [...list, value] };
    }
    moduleLocations[moduleId] = target;
    writeConfig({ ...config, moduleLocations });
    return { message: `选项「${value}」已恢复` };
  };

  const restoreManager = (payload) => {
    const { campus, account } = payload || {};
    const config = readConfig();
    if (!account?.username) return { error: '条目数据不完整' };
    if (!config.campuses.includes(campus)) return { error: `校区「${campus}」不存在，请先恢复该校区` };
    const list = readManagers(campus);
    if (list.some((item) => item.username === account.username)) return { message: '该账号已存在，无需恢复' };
    writeManagers(campus, [...list, account]);
    return { message: `宿管账号「${account.username}」已恢复（密码为删除前的原密码）` };
  };

  return {
    capture,
    captureManagerDeletion,
    restoreHandlers: {
      campus: (item) => restoreCampus(item.payload),
      module: (item) => restoreModule(item.payload),
      option: (item) => restoreOption(item.payload),
      manager: (item) => restoreManager(item.payload),
    },
  };
};