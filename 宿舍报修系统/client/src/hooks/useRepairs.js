import { useCallback, useEffect, useState } from 'react';
import { deleteRepair, fetchRepairs, markRepairHandled } from '../lib/api';

/** 轮询间隔（毫秒）：学生一提交，宿管/管理员不刷新页面也能看到新工单 */
const POLL_INTERVAL = 5000;

/**
 * 报修工单列表：查看工单、标记已处理；canDelete 为 true 时（管理员）才提供删除能力。
 * 定时轮询保证学生新提交的工单及时出现在后台。
 */
export function useRepairs(adminToken, { notify, onAuthLost, confirm, canDelete = true }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { ok, status, data } = await fetchRepairs(adminToken);
    if (!ok) {
      if (status === 403) onAuthLost();
      setLoading(false);
      return false;
    }
    setRecords(Array.isArray(data) ? data : []);
    setLoading(false);
    return true;
  }, [adminToken, onAuthLost]);

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, [reload]);

  // 定时刷新，并在页面重新可见 / 获得焦点时立即刷新一次：
  // 学生提交后宿管与管理员无需手动刷新即可收到新工单。
  useEffect(() => {
    const refresh = () => reload().catch(() => {});
    const timer = setInterval(refresh, POLL_INTERVAL);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [reload]);

  const markHandled = async (id) => {
    const { ok, data } = await markRepairHandled(id, adminToken);
    if (!ok) {
      notify(data.error || '标记失败', 'error');
      return;
    }
    notify('已标记为已处理', 'success');
    await reload();
  };

  const removeRepair = async (id) => {
    // 权限开关在 hook 内部把关，不只依赖界面不渲染按钮
    if (!canDelete) {
      notify('当前账号没有删除工单的权限', 'error');
      return;
    }
    const ok = await confirm('此操作不可恢复。是否确认删除该报修工单？', {
      title: '删除工单',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    const { ok: delOk, data } = await deleteRepair(id, adminToken);
    if (!delOk) {
      notify(data.error || '删除失败', 'error');
      return;
    }
    notify('工单删除成功', 'success');
    await reload();
  };

  return { records, loading, markHandled, removeRepair };
}