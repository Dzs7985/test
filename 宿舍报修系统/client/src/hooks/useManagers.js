import { useCallback, useEffect, useState } from 'react';
import { createManager, deleteManager, fetchManagers, updateManager } from '../lib/api';

/**
 * 宿管账号列表与增删改（仅管理员可操作）。
 * 账号数据按校区独立存储：list 只包含 campus 校区的账号，切换校区会自动重载；
 * 不同校区允许同名账号、互不影响。building 表示该账号绑定的楼号。
 */
export function useManagers(adminToken, campus, { notify, onAuthLost }) {
  const [list, setList] = useState([]);

  const reload = useCallback(async () => {
    if (!campus) {
      setList([]);
      return false;
    }
    const { ok, status, data } = await fetchManagers(campus, adminToken);
    if (!ok) {
      if (status === 403) onAuthLost();
      return false;
    }
    setList(Array.isArray(data) ? data : []);
    return true;
  }, [adminToken, campus, onAuthLost]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  /** 新建账号（初始密码由服务端写入默认密码）。成功返回含初始密码的账号，失败提示后返回 null；成功提示由调用方按场景给出。 */
  const addAccount = async (username, building = '') => {
    const name = (username || '').trim();
    if (!name) {
      notify('用户名不能为空', 'error');
      return null;
    }
    if (list.find((item) => item.username === name)) {
      notify('本校区已存在同名账号', 'error');
      return null;
    }
    if (building && list.find((item) => item.building === building)) {
      notify('该楼号已绑定宿管账号', 'error');
      return null;
    }
    const { ok, data } = await createManager({ username: name, campus, building }, adminToken);
    if (!ok) {
      notify(data.error || '添加失败', 'error');
      return null;
    }
    await reload();
    return { username: data.username || name, password: data.password || '' };
  };

  const saveAccountEdit = async (originalUsername, nextUsername, nextPassword) => {
    const newName = (nextUsername || '').trim();
    const password = (nextPassword || '').trim();
    if (!newName && !password) {
      notify('请输入要更新的用户名或密码', 'error');
      return false;
    }
    if (newName && newName !== originalUsername && list.find((item) => item.username === newName)) {
      notify('本校区已存在同名账号', 'error');
      return false;
    }

    const body = {};
    if (newName && newName !== originalUsername) body.newUsername = newName;
    if (password) body.password = password;

    const { ok, data } = await updateManager(campus, originalUsername, body, adminToken);
    if (!ok) {
      notify(data.error || '修改失败', 'error');
      return false;
    }
    notify('修改成功', 'success');
    await reload();
    return true;
  };

  /** 楼号改名后同步账号的绑定，避免账号挂到已不存在的楼号上（成功提示由调用方统一给出）。 */
  const bindBuilding = async (username, building) => {
    const { ok, data } = await updateManager(campus, username, { building }, adminToken);
    if (!ok) {
      notify(data.error || '楼号绑定失败', 'error');
      return false;
    }
    await reload();
    return true;
  };

  /** 删除账号。二次确认由调用方负责（删楼号时会连带删账号，只弹一次确认框）。 */
  const deleteAccount = async (username) => {
    const { ok, data } = await deleteManager(campus, username, adminToken);
    if (!ok) {
      notify(data.error || '删除失败', 'error');
      return false;
    }
    await reload();
    return true;
  };

  return { list, addAccount, saveAccountEdit, bindBuilding, deleteAccount };
}