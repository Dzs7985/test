import { useCallback, useEffect, useState } from 'react';
import { fetchMyRepairs } from '../../lib/api';
import {
  formatDateTime,
  normalizeRepairStatus,
  REPAIR_STATUS_DONE,
  REPAIR_STATUS_DOING,
} from '../../lib/constants';

/** 轮询间隔：宿管更新状态后，学生停在本页也能自动看到进度变化 */
const POLL_INTERVAL = 8000;

const STATUS_CLASS = {
  未完成: 'pending',
  维修中: 'doing',
  已完成: 'done',
};

/** 三步进度条：提交（未完成）→ 维修中 → 已完成，当前步骤之前的节点全部点亮 */
function ProgressSteps({ status }) {
  const steps = ['未完成', '维修中', '已完成'];
  const current = steps.indexOf(normalizeRepairStatus(status));
  const activeIndex = current === -1 ? 0 : current;

  return (
    <ol className="repair-steps">
      {steps.map((label, index) => (
        <li key={label} className={index <= activeIndex ? 'is-active' : ''}>
          {index > 0 ? <span className="step-line" /> : null}
          <span className="step-dot">{index + 1}</span>
          <span className="step-label">{label}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * 学生「我的报修」：共享学生账号下以「姓名 + 联系方式」识别本人，
 * 后端 /api/my-repairs 精确匹配后返回，学生拿不到他人工单。
 */
export default function MyRepairs({ token, identity, onIdentityChange }) {
  const [name, setName] = useState(identity.name || '');
  const [contact, setContact] = useState(identity.contact || '');
  const [records, setRecords] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [queried, setQueried] = useState(false);

  const query = useCallback(
    async (silent = false) => {
      const nextName = name.trim();
      const nextContact = contact.trim();
      if (!nextName || !nextContact) {
        setError('请填写姓名与联系方式后查询');
        return;
      }
      setError('');
      if (!silent) setLoading(true);
      const { ok, status, data } = await fetchMyRepairs(nextName, nextContact, token);
      if (!silent) setLoading(false);
      if (!ok) {
        setError(status === 403 ? '登录状态已失效，请重新登录' : data.error || '查询失败');
        return;
      }
      onIdentityChange({ name: nextName, contact: nextContact });
      setRecords(Array.isArray(data) ? data : []);
      setQueried(true);
    },
    [name, contact, token, onIdentityChange],
  );

  // 已有保存的身份信息时，进入页签自动查询
  useEffect(() => {
    if (identity.name && identity.contact) {
      name === identity.name || setName(identity.name);
      contact === identity.contact || setContact(identity.contact);
      query(true);
    }
    // 仅在身份变化时自动查询，不随 query 引用重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.name, identity.contact]);

  // 轮询：查询成功后定时静默刷新，让状态变化自动出现
  useEffect(() => {
    if (!queried) return undefined;
    const timer = setInterval(() => query(true), POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [queried, query]);

  return (
    <div className="my-repairs">
      <h2>我的报修</h2>

      <form
        className="my-repairs-query"
        onSubmit={(event) => {
          event.preventDefault();
          query();
        }}
      >
        <label>
          姓名
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="报修时填写的姓名" />
        </label>
        <label>
          联系方式
          <input
            value={contact}
            onChange={(event) => setContact(event.target.value.replace(/\D/g, '').slice(0, 11))}
            inputMode="numeric"
            maxLength={11}
            placeholder="11 位手机号"
          />
        </label>
        <button type="submit" className="primary-btn" disabled={loading}>
          {loading ? '查询中…' : '查询'}
        </button>
      </form>

      {error ? <p className="message" style={{ color: '#dc2626' }}>{error}</p> : null}

      {queried && !loading && records?.length === 0 && !error ? (
        <p className="empty">未查询到报修记录，请确认姓名与联系方式与报修时一致。</p>
      ) : null}

      <div className="record-list">
        {(records || []).map((item) => {
          const status = normalizeRepairStatus(item.status);
          const location = [item.campus, item.building, item.roomNumber].filter(Boolean).join(' / ');
          return (
            <article key={item.id} className="record-card">
              <div className="record-head">
                <span>{item.category || '报修单'}</span>
                <span className={`status ${STATUS_CLASS[status] || 'pending'}`}>{status}</span>
              </div>

              <ProgressSteps status={status} />

              <p>位置：{location || '—'}</p>
              <p>问题描述：{item.description || '—'}</p>
              <p>提交时间：{formatDateTime(item.createdAt)}</p>
              {status === REPAIR_STATUS_DONE ? (
                <p className="record-done-tip">该报修已完成，如仍有问题请重新提交报修。</p>
              ) : status === REPAIR_STATUS_DOING ? (
                <p className="record-doing-tip">维修人员正在处理，请耐心等待。</p>
              ) : (
                <p className="record-pending-tip">报修已提交，等待宿管安排维修。</p>
              )}

              {item.image ? (
                <a href={item.image} target="_blank" rel="noreferrer">
                  <img className="repair-image" src={item.image} alt="报修照片" />
                </a>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
