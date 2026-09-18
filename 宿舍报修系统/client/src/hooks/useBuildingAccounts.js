import { useCallback } from 'react';

/** 楼号命名规则：数字 + 固定后缀，例如 3 → 3号楼 */
export const BUILDING_SUFFIX = '号楼';

/** 一次最多生成的楼号数量，避免误输入范围造成批量写入 */
const MAX_RANGE = 30;

/** 成功提示里逐个列出「楼号：账号/密码」的最大数量，超过则只给汇总文案 */
const DETAIL_LIMIT = 5;

const usernamePrefix = 'dorm';

/**
 * 生成 dorm1、dorm2…，只按本校区已占用的名字递增。
 * 账号数据按校区分开存储，所以不同校区可以出现同名账号。
 * 后端要求用户名只允许字母与数字，所以不能用中文楼号名直接当用户名。
 */
const nextUsername = (list) => {
  const used = new Set(list.map((item) => item.username));
  let index = 1;
  while (used.has(`${usernamePrefix}${index}`)) index += 1;
  return `${usernamePrefix}${index}`;
};

/** 「由 N 到 M」→ [N号楼, …, M号楼] */
const buildRange = (start, end) => {
  const names = [];
  for (let n = start; n <= end; n += 1) names.push(`${n}${BUILDING_SUFFIX}`);
  return names;
};

/**
 * 楼号与其宿管账号（1:1）的联动编排：
 * 一键生成一段楼号并自动建账号、删除楼号连带删账号、楼号改名同步账号绑定。
 * 账号增删改由 useManagers 提供，楼号增删改由 useCampusConfig 提供，这里只负责把两者串起来。
 */
export function useBuildingAccounts(campus, managers, notify, confirm) {
  const { list, addAccount, saveAccountEdit, bindBuilding, deleteAccount } = managers;
  const { selectedCampus, buildings, addBuildings, removeBuilding, saveBuildingEdit, buildingEditor } = campus;

  const accountFor = useCallback(
    (building) =>
      list.find((item) => item.campus === selectedCampus && item.building === building) || null,
    [list, selectedCampus],
  );

  /** 建账号：初始密码由服务端按默认密码写入；taken 为已占用的账号列表（批量生成时要算上本次刚建的）。 */
  const createAccount = async (building, taken) => {
    const account = await addAccount(nextUsername(taken), building);
    return account ? { building, ...account } : null;
  };

  /** 给单个楼号补建账号（历史楼号没有账号时用），成功返回账号对象。 */
  const createAccountFor = async (building) => {
    const account = await createAccount(building, list);
    if (account) notify(`已为 ${building} 生成账号 ${account.username}`, 'success');
    return account;
  };

  const rollbackAccounts = async (created) => {
    for (const item of created) await deleteAccount(item.username);
  };

  const summaryText = (created, skipped) => {
    const detail = created.map((item) => `${item.building}：${item.username}/${item.password}`).join('、');
    const body = created.length <= DETAIL_LIMIT ? ` —— ${detail}` : `，初始密码均为 ${created[0].password}，点楼号可在右侧查看`;
    return `已生成 ${created.length} 个楼号及账号${body}${skipped ? `（已跳过 ${skipped} 个已存在的楼号）` : ''}`;
  };

  /**
   * 一键生成一段楼号（如 1 到 5 → 1号楼…5号楼；只填「由」则只建一个楼号），并为每个新楼号建账号。
   * 先建账号再保存楼号：中途失败就把已建账号删掉，不会留下挂不到楼号的账号。
   * 成功返回新增的楼号列表（供界面选中第一个）。
   */
  const addBuildingsWithAccounts = async (startText, endText) => {
    const start = Number(startText);
    // 「到」留空时按单个楼号处理，添加一个楼号不必重复填两个数字
    const end = String(endText ?? '').trim() === '' ? start : Number(endText);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      notify('请输入正确的楼号范围，例如 1 到 5；只填「由」则生成单个楼号', 'error');
      return null;
    }
    if (end - start + 1 > MAX_RANGE) {
      notify(`一次最多生成 ${MAX_RANGE} 个楼号`, 'error');
      return null;
    }

    const names = buildRange(start, end);
    const added = names.filter((item) => !buildings.includes(item));
    if (!added.length) {
      notify('这些楼号都已存在', 'error');
      return null;
    }

    const taken = [...list];
    const created = [];
    for (const building of added) {
      const account = await createAccount(building, taken);
      if (!account) {
        await rollbackAccounts(created);
        return null;
      }
      taken.push({ username: account.username });
      created.push(account);
    }

    const ok = await addBuildings(added);
    if (!ok) {
      await rollbackAccounts(created);
      return null;
    }
    notify(summaryText(created, names.length - added.length), 'success');
    return added;
  };

  const removeBuildingWithAccount = async (value) => {
    const account = accountFor(value);
    const extra = account ? `\n该楼号绑定的宿管账号 “${account.username}” 也会一并删除。` : '';
    const ok = await confirm(`删除后将无法恢复。是否确认删除楼号 “${value}”？${extra}`, {
      title: '删除楼号',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return false;

    // 先删账号再删楼号：若楼号保存失败，楼号还在、只是回到「可重新生成账号」的状态，不会留下孤立账号
    if (account && !(await deleteAccount(account.username))) return false;
    return removeBuilding(value);
  };

  /** 楼号改名后同步账号绑定；账号用户名保持原样，可在右侧单独修改。 */
  const saveBuildingEditWithAccount = async () => {
    const oldName = buildings[buildingEditor.index];
    const nextName = (buildingEditor.value || '').trim();
    const ok = await saveBuildingEdit();
    if (!ok) return false;

    if (oldName && nextName && nextName !== oldName) {
      const account = list.find((item) => item.campus === selectedCampus && item.building === oldName);
      if (account) await bindBuilding(account.username, nextName);
    }
    return true;
  };

  const updateAccount = (account, username, password) =>
    saveAccountEdit(account.username, username, password);

  return {
    accountFor,
    createAccountFor,
    addBuildingsWithAccounts,
    removeBuildingWithAccount,
    saveBuildingEditWithAccount,
    updateAccount,
  };
}