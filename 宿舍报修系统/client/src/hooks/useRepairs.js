import { useCallback, useEffect, useState } from 'react';
import { deleteRepair, fetchRepairs, updateRepairStatus } from '../lib/api';
import { isRepairDone } from '../lib/constants';

/** 轮询间隔（毫秒）：学生一提交，宿管/管理员不刷新页面也能看到新工单 */
const POLL_INTERVAL = 5000;

/**
 * 列表排序：未完成的排在前、已完成的沉到下方；同组内按提交时间倒序（最新的在上）。
 * 服务端只按时间倒序返回，这里再按状态分组，保证「最新完成的工单也在未完成之后」。
 */
const sortForBoard = (list) =>
  [...list].sort((a, b) => {
    const byStatus = Number(isRepairDone(a.status)) - Number(isRepairDone(b.status));
    return byStatus || new Date(b.createdAt) - new Date(a.createdAt);
  });

/**
 * 报修工单列表：查看工单、标记完成（未完成 → 已完成）、删除。
 * canDelete 是删除权限的唯一来源（默认拒绝，只有管理员视图显式传 true），
 * 界面与操作都读它，两层不会出现分歧。定时轮询保证学生新提交的工单及时出现在后台。
 */
export function useRepairs(adminToken, { notify, onAuthLost, confirm, canDelete = false }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { ok, status, data } = await fetchRepairs(adminToken);
    if (!ok) {
      if (status === 403) onAuthLost();
      setLoading(false);
      return false;
    }
    setRecords(sortForBoard(Array.isArray(data) ? data : []));
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

  const changeStatus = useCallback(
    async (id, action, successText, feedback = '') => {
      const { ok, data } = await updateRepairStatus(id, action, adminToken, feedback);
      if (!ok) {
        notify(data.error || '操作失败', 'error');
        return false;
      }
      notify(successText, 'success');
      await reload();
      return true;
    },
    [adminToken, notify, reload],
  );

  /** 标记完成：未完成 → 已完成；处理说明可留空，学生在自查页面可见 */
  const finishRepair = (id, feedback = '') =>
    changeStatus(id, 'finish', '已标记为已完成，处理说明将展示给学生自查', feedback);

  const removeRepair = async (id) => {
    // 权限开关在 hook 内部把关，不只依赖界面不渲染按钮
    if (!canDelete) {
      notify('当前账号没有删除工单的权限', 'error');
      return;
    }
    const ok = await confirm('删除后工单会移入回收站，可在保留期内恢复。是否确认删除该报修工单？', {
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
    notify(data.message || '已移入回收站', 'success');
    await reload();
  };

  return { records, loading, finishRepair, removeRepair, canDelete };
}