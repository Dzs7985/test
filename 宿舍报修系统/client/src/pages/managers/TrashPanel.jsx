import { useCallback, useEffect, useState } from 'react';
import { fetchTrash, restoreTrashItem, saveTrashRetention } from '../../lib/api';
import { formatDateTime } from '../../lib/constants';

/** 条目类型 → 展示名 */
const TYPE_LABELS = { repair: '工单', campus: '校区', module: '模块', manager: '宿管账号', option: '地点选项', lostitem: '失物招领' };

/** 剩余保留时间（按删除时间 + 保留天数计算），到期由服务端自动清理 */
const remainText = (deletedAt, retentionDays) => {
  const rest = retentionDays * 86400000 - (Date.now() - Date.parse(deletedAt));
  if (!Number.isFinite(rest) || rest <= 0) return '即将清理';
  const days = Math.floor(rest / 86400000);
  if (days > 0) return `剩余 ${days} 天`;
  const hours = Math.floor((rest % 86400000) / 3600000);
  return hours > 0 ? `剩余 ${hours} 小时` : '即将清理';
};

/**
 * 回收站（仅管理员）：删除的工单/校区/楼号/模块/地点选项/宿管账号在这里保留，
 * 保留期内可恢复；条目不可手动删除，到期自动清理（保留天数可调）。
 */
export default function TrashPanel({ adminToken, session }) {
  const { notify, confirm, onAuthLost } = session;
  const [data, setData] = useState({ retentionDays: 7, items: [] });
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('7');

  const reload = useCallback(async () => {
    const { ok, status, data: body } = await fetchTrash(adminToken);
    if (!ok) {
      if (status === 403) onAuthLost();
      setLoading(false);
      return;
    }
    setData(body);
    setDays(String(body.retentionDays ?? 7));
    setLoading(false);
  }, [adminToken, onAuthLost]);

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, [reload]);

  const saveDays = async () => {
    const { ok, data: body } = await saveTrashRetention(days, adminToken);
    if (!ok) {
      notify(body.error || '保存失败', 'error');
      return;
    }
    notify(`自动清理时间已设为 ${body.retentionDays} 天`, 'success');
    await reload();
  };

  const restore = async (item) => {
    const ok = await confirm(`确定恢复${item.label}？恢复后它会回到原来的位置。`, {
      title: '恢复条目',
      confirmText: '恢复',
    });
    if (!ok) return;
    const { ok: done, data: body } = await restoreTrashItem(item.id, adminToken);
    if (!done) {
      notify(body.error || '恢复失败', 'error');
      await reload();
      return;
    }
    notify(body.message || '恢复成功', 'success');
    await reload();
  };

  return (
    <div>
      <h3 className="trash-title">回收站</h3>
      <p className="module-hint">
        删除的工单、校区、楼号、模块、地点选项与宿管账号会先进入这里，保留期内可随时恢复；到期后自动清理，不支持手动删除。
      </p>

      <div className="trash-toolbar">
        <label className="trash-retention-field">
          自动清理时间
          <input
            type="number"
            min="1"
            max="365"
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
          天
        </label>
        <button type="button" className="secondary-btn trash-save-btn" onClick={saveDays}>
          保存
        </button>
        <span className="trash-count">共 {data.items.length} 条</span>
      </div>

      {loading ? <p className="empty">加载中…</p> : null}
      {!loading && data.items.length === 0 ? (
        <div className="trash-empty">
          <strong>回收站是空的</strong>
          <small>删除的工单与配置会先来到这里，保留期内可随时恢复</small>
        </div>
      ) : null}

      <div className="trash-list">
        {data.items.map((item) => (
          <div key={item.id} className="trash-item">
            <span className={`trash-type trash-type-${item.type}`}>{TYPE_LABELS[item.type] || '条目'}</span>
            <div className="trash-main">
              <p>{item.label}</p>
              <small className="trash-meta">
                <span>删除时间：{formatDateTime(item.deletedAt)}</span>
                <span className="trash-remain">{remainText(item.deletedAt, data.retentionDays)}</span>
              </small>
            </div>
            <button type="button" className="secondary-btn trash-restore" onClick={() => restore(item)}>
              恢复
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}