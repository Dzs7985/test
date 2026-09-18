import { useCallback, useEffect, useState } from 'react';
import { fetchConfig, normalizeConfig, saveConfig } from '../lib/api';
import { defaultCampusOptions } from '../lib/constants';
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
 */
export function useCampusConfig(adminToken, notify, confirm) {
  const [campuses, setCampuses] = useState([]);
  const [campusBuildings, setCampusBuildings] = useState({});
  // 忘记密码时提示学生联系的电话，与校区/楼号一起存在同一份配置里
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [selectedCampus, setSelectedCampus] = useState(defaultCampusOptions[0] || '');
  const campusEditor = useListEditor();
  const buildingEditor = useListEditor();

  const buildings = campusBuildings[selectedCampus] || [];

  const applyConfig = useCallback((config) => {
    if (!config) return;
    setCampuses(config.campuses || []);
    setCampusBuildings(config.campusBuildings || {});
    setEmergencyPhone(config.emergencyPhone || '');
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
      const { ok, data } = await saveConfig(nextConfig, adminToken);
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
    const ok = await confirm(`删除后将无法恢复。是否确认删除校区 “${value}”？`, {
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

  return {
    campuses,
    buildings,
    selectedCampus,
    emergencyPhone,
    setSelectedCampus,
    campusEditor,
    buildingEditor,
    addCampus,
    addBuildings,
    deleteCampus,
    removeBuilding,
    saveCampusEdit,
    saveBuildingEdit,
    saveEmergencyPhone,
  };
}