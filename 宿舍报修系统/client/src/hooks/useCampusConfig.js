import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchConfig, normalizeConfig, saveConfig } from '../lib/api';
import { defaultCampusOptions, defaultModules } from '../lib/constants';
import { DORM_MODULE_ID, findModule, newModuleId } from '../lib/modules';
import { useListEditor } from './useListEditor';

const syncEventName = 'dorm-config-sync';

/** 楼号按数字从小到大排列（2号楼、10号楼…）；非数字开头的名字排在最后并保持原有相对顺序。 */
const sortBuildings = (list) => {
  const leadingNumber = (name) => {
    const matched = /^\d+/.exec(String(name));
    return matched ? Number(matched[0]) : Number.POSITIVE_INFINITY;
  };
  return [...list].sort((a, b) => leadingNumber(a) - leadingNumber(b));
};

const broadcastConfigSync = (config) => {
  try {
    localStorage.setItem(syncEventName, JSON.stringify({ ...config, ts: Date.now() }));
  } catch (error) {
    console.warn('localStorage sync failed', error);
  }
  window.dispatchEvent(new CustomEvent(syncEventName, { detail: config }));
};

/**
 * 校区与楼号配置（含选中校区切换、增删改、跨页面同步）。
 * confirm: 受控确认函数（useConfirm 提供，替代 window.confirm）。
 * 楼号不再是独立状态，而是由「选中校区」从 campusBuildings 派生，避免两份状态不同步。
 * modules（报修模块）与校区/楼号共用同一份配置，模块管理页与校区设置因此不会各持一份。
 */
export function useCampusConfig(adminToken, notify, confirm) {
  const [campuses, setCampuses] = useState([]);
  const [campusBuildings, setCampusBuildings] = useState({});
  // 忘记密码时提示学生联系的电话，与校区/楼号一起存在同一份配置里
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [modules, setModules] = useState(defaultModules);
  // 各模块「具体地点」的选项（管理员在「模块管理 → 地点设置」维护，学生表单按此渲染下拉）
  const [moduleLocations, setModuleLocations] = useState({});
  const [selectedCampus, setSelectedCampus] = useState(defaultCampusOptions[0] || '');
  const campusEditor = useListEditor();
  const buildingEditor = useListEditor();
  const moduleEditor = useListEditor();
  // 保存串行化队列：连续快速操作（如连续拖拽排序）时，后一次保存排队等待前一次完成，
  // 保证服务端按操作顺序落盘，避免并发请求导致写入顺序错乱
  const saveQueueRef = useRef(Promise.resolve());

  const buildings = campusBuildings[selectedCampus] || [];

  const applyConfig = useCallback((config) => {
    if (!config) return;
    setCampuses(config.campuses || []);
    setCampusBuildings(config.campusBuildings || {});
    setEmergencyPhone(config.emergencyPhone || '');
    setModules(config.modules || defaultModules);
    setModuleLocations(config.moduleLocations || {});
  }, []);

  const reload = useCallback(async () => {
    applyConfig(await fetchConfig());
  }, [applyConfig]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  useEffect(() => {
    if (campuses.length && !campuses.includes(selectedCampus)) {
      setSelectedCampus(campuses[0]);
    }
  }, [campuses, selectedCampus]);

  const persist = useCallback(
    async (nextConfig, successText) => {
      // 排队等待上一次保存结束再发出；上一次失败也要放行后续保存，避免队列中断
      const save = saveQueueRef.current.then(() => saveConfig(nextConfig, adminToken));
      saveQueueRef.current = save.catch(() => {});
      const { ok, data } = await save;
      if (!ok) {
        notify(data.error || '保存失败', 'error');
        return false;
      }
      const normalized = normalizeConfig(data);
      applyConfig(normalized);
      if (normalized) {
        broadcastConfigSync({
          campuses: normalized.campuses,
          buildings: normalized.buildings,
          campusBuildings: normalized.campusBuildings,
          emergencyPhone: normalized.emergencyPhone,
          modules: normalized.modules,
          moduleLocations: normalized.moduleLocations,
        });
      }
      if (successText) notify(successText, 'success');
      return true;
    },
    [adminToken, applyConfig, notify],
  );

  const addCampus = async (name) => {
    const value = (name || '').trim();
    if (!value) return false;
    if (campuses.includes(value)) {
      notify('校区已存在', 'error');
      return false;
    }
    // 新校区不带楼号：楼号与宿管账号由「由 N 到 M 号楼 → 一键生成」一起创建，
    // 不继承当前校区的楼号，避免出现「有楼号却没有对应账号」的中间状态。
    const nextCampusBuildings = { ...campusBuildings, [value]: [] };
    return persist({ campuses: [...campuses, value], campusBuildings: nextCampusBuildings }, '校区添加成功');
  };

  /** 一次新增多个楼号：只提交一次配置，避免逐个请求产生中间状态。成功后楼号按数字从小到大排列。 */
  const addBuildings = async (names) => {
    const added = names.filter((item) => !buildings.includes(item));
    if (!added.length) return false;
    const nextCampusBuildings = {
      ...campusBuildings,
      [selectedCampus]: sortBuildings([...buildings, ...added]),
    };
    return persist({ campuses, campusBuildings: nextCampusBuildings }, '');
  };

  const deleteCampus = async (value) => {
    if (campuses.length <= 1) {
      notify('校区至少保留一项', 'error');
      return false;
    }
    const ok = await confirm(`删除后校区及其楼号、宿管账号会移入回收站，可在保留期内恢复。是否确认删除校区 “${value}”？`, {
      title: '删除校区',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return false;
    const nextCampusBuildings = { ...campusBuildings };
    delete nextCampusBuildings[value];
    return persist(
      { campuses: campuses.filter((item) => item !== value), campusBuildings: nextCampusBuildings },
      '校区删除成功',
    );
  };

  /** 删除楼号。二次确认由调用方负责：删楼号会连带删除绑定的宿管账号，需要合并成一次确认。 */
  const removeBuilding = async (value) => {
    if (buildings.length <= 1) {
      notify('当前校区至少保留一项楼号', 'error');
      return false;
    }
    const nextCampusBuildings = { ...campusBuildings, [selectedCampus]: buildings.filter((item) => item !== value) };
    return persist({ campuses, campusBuildings: nextCampusBuildings }, '楼号删除成功');
  };

  const saveCampusEdit = async () => {
    const value = campusEditor.value.trim();
    if (!value) return false;
    const oldName = campuses[campusEditor.index];
    if (campuses.includes(value) && oldName !== value) {
      notify('校区已存在', 'error');
      return false;
    }
    const nextCampuses = [...campuses];
    nextCampuses[campusEditor.index] = value;
    const nextCampusBuildings = { ...campusBuildings };
    if (oldName && nextCampusBuildings[oldName]) {
      nextCampusBuildings[value] = nextCampusBuildings[oldName];
      delete nextCampusBuildings[oldName];
    }
    // 告诉后端这是改名而不是「删一个校区 + 加一个校区」，账号文件才能跟着改名
    const campusRenames = oldName && oldName !== value ? [{ from: oldName, to: value }] : [];
    const ok = await persist({ campuses: nextCampuses, campusBuildings: nextCampusBuildings, campusRenames }, '校区修改成功');
    if (ok) campusEditor.cancel();
    return ok;
  };

  const saveBuildingEdit = async () => {
    const value = buildingEditor.value.trim();
    if (!value) return false;
    const oldName = buildings[buildingEditor.index];
    if (buildings.includes(value) && oldName !== value) {
      notify('楼号已存在', 'error');
      return false;
    }
    const nextBuildings = [...buildings];
    nextBuildings[buildingEditor.index] = value;
    const nextCampusBuildings = { ...campusBuildings, [selectedCampus]: nextBuildings };
    const ok = await persist({ campuses, campusBuildings: nextCampusBuildings }, '楼号修改成功');
    if (ok) buildingEditor.cancel();
    return ok;
  };

  /** 更新紧急联系电话（登录页「忘记密码」会提示学生联系）。留空即清除；11 位校验由服务端拦截。 */
  const saveEmergencyPhone = async (phone) => {
    const value = String(phone || '').trim();
    if (value && !/^\d{11}$/.test(value)) {
      notify('紧急联系电话需为 11 位数字', 'error');
      return false;
    }
    return persist(
      { campuses, campusBuildings, emergencyPhone: value },
      value ? '紧急联系电话已保存' : '已清除紧急联系电话',
    );
  };

  /** 模块操作只改 modules 数组，其余配置字段由服务端保持原值（与 emergencyPhone 相同的合并约定） */
  const persistModules = (nextModules, successText) =>
    persist({ campuses, campusBuildings, modules: nextModules }, successText);

  /**
   * 更新某模块的地点选项配置：「模块管理 → 地点设置」里的增删改都走这里。
   * build 基于该模块当前配置返回新值；整份配置一次提交，配合保存队列保证落盘顺序。
   */
  const updateModuleLocation = (moduleId, build, successText) =>
    persist(
      {
        campuses,
        campusBuildings,
        moduleLocations: { ...moduleLocations, [moduleId]: build(moduleLocations[moduleId] || {}) },
      },
      successText,
    );

  const addModule = async (name) => {
    const value = (name || '').trim();
    if (!value) return false;
    if (modules.some((item) => item.name === value)) {
      notify('模块已存在', 'error');
      return false;
    }
    // 新增模块一律「具体地点」模式（仅管理员可见）；id 与名称解耦，重命名后保持稳定
    return persistModules(
      [...modules, { id: newModuleId(), name: value, enabled: true, locationMode: 'custom' }],
      '模块添加成功',
    );
  };

  /** 重命名模块（宿舍模块也允许改名，但不可删除） */
  const saveModuleEdit = async () => {
    const value = moduleEditor.value.trim();
    const target = modules[moduleEditor.index];
    if (!value || !target) return false;
    if (modules.some((item) => item.id !== target.id && item.name === value)) {
      notify('模块已存在', 'error');
      return false;
    }
    const ok = await persistModules(
      modules.map((item) => (item.id === target.id ? { ...item, name: value } : item)),
      '模块修改成功',
    );
    if (ok) moduleEditor.cancel();
    return ok;
  };

  /** 删除模块：宿舍报修不可删除；历史工单保留，后台仍可辨认（显示「已删除的模块」） */
  const deleteModule = async (id) => {
    const target = findModule({ modules }, id);
    if (!target) return false;
    if (id === DORM_MODULE_ID) {
      notify('宿舍报修模块不可删除', 'error');
      return false;
    }
    const ok = await confirm(`删除后报修入口不再显示「${target.name}」，历史工单仍会保留；模块与其地点设置会移入回收站，可在保留期内恢复。是否确认删除？`, {
      title: '删除报修模块',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return false;
    return persistModules(modules.filter((item) => item.id !== id), '模块删除成功');
  };

  /** 勾选启用/停用：只影响报修入口是否显示该模块。
      切换后立即按「启用在前、未启用在后」重排并保存：停用的模块确认后自动移到底部，
      启用则回到启用段末尾，与列表「未启用固定沉底」的规则一致（不等刷新） */
  const toggleModule = (id, enabled) => {
    const toggled = modules.map((item) => (item.id === id ? { ...item, enabled } : item));
    const nextModules = [
      ...toggled.filter((item) => item.enabled),
      ...toggled.filter((item) => !item.enabled),
    ];
    return persistModules(nextModules, '');
  };

  /** 拖拽排序：按给定 id 顺序整体保存。不做 from/to 索引运算——
      保存队列在途时连续拖拽会拿到旧数组算错落点，按 id 快照重排则始终正确 */
  const reorderModules = (orderedIds) => {
    const byId = new Map(modules.map((item) => [item.id, item]));
    const nextModules = orderedIds.map((id) => byId.get(id)).filter(Boolean);
    if (nextModules.length !== modules.length) return false;
    if (nextModules.every((item, index) => item.id === modules[index].id)) return false;
    return persistModules(nextModules, '模块顺序已更新');
  };

  return {
    campuses,
    buildings,
    selectedCampus,
    emergencyPhone,
    modules,
    moduleLocations,
    setSelectedCampus,
    campusEditor,
    buildingEditor,
    moduleEditor,
    addCampus,
    addBuildings,
    deleteCampus,
    removeBuilding,
    saveCampusEdit,
    saveBuildingEdit,
    saveEmergencyPhone,
    addModule,
    saveModuleEdit,
    deleteModule,
    toggleModule,
    reorderModules,
    updateModuleLocation,
  };
}