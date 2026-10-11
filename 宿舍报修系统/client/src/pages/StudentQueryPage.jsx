import { useState } from 'react';
import { queryRepairByCode, queryRepairsByContact, submitRepairFollowUp } from '../lib/api';
import { formatDateTime, normalizeRepairStatus, REPAIR_STATUS_CLASS } from '../lib/constants';
import { formatRepairLocation } from '../lib/locationOptions';

const STEPS = ['未完成', '已完成'];

/** 两步进度条：让学生一眼看到工单处于未完成还是已完成（样式见 styles/student.css） */
function RepairSteps({ status }) {
  const current = STEPS.indexOf(status);
  return (
    <ol className="repair-steps">
      {STEPS.map((step, index) => (
        <li
          key={step}
          className={(index <= current ? 'is-active' : '') + (index === current ? ' is-current' : '')}
        >
          {index > 0 ? <span className="step-line" /> : null}
          <span className="step-dot">{index + 1}</span>
          {step}
        </li>
      ))}
    </ol>
  );
}

/**
 * 学生自查页（无需账号）：两种查询方式——
 * 1. 查询码（提交成功后展示）；2. 提交时填写的手机号。
 * 查到工单后可查看处理状态与管理员处理说明；若仍未处理或问题未解决，可提交追评反馈（管理员可见）。
 */
export default function StudentQueryPage() {
  const [mode, setMode] = useState('code');
  const [code, setCode] = useState('');
  const [contact, setContact] = useState('');
  const [records, setRecords] = useState(null);
  const [error, setError] = useState('');
  const [tip, setTip] = useState('');
  const [busy, setBusy] = useState(false);
  // 正在追评的工单 id 与内容（同一时间只展开一个输入框）
  const [noteFor, setNoteFor] = useState('');
  const [noteText, setNoteText] = useState('');

  const search = async (event) => {
    event.preventDefault();
    setError('');
    setTip('');
    setRecords(null);
    setNoteFor('');
    setNoteText('');
    setBusy(true);
    if (mode === 'code') {
      const { ok, data } = await queryRepairByCode(code);
      setBusy(false);
      if (!ok) {
        setError(data.error || '查询失败');
        return;
      }
      setRecords([data]);
      return;
    }
    const { ok, data } = await queryRepairsByContact(contact);
    setBusy(false);
    if (!ok) {
      setError(data.error || '查询失败');
      return;
    }
    setRecords(Array.isArray(data) ? data : []);
  };

  const sendFollowUp = async (record, kind) => {
    if (!noteText.trim()) {
      setError('请填写反馈内容');
      return;
    }
    setError('');
    const payload = {
      id: record.id,
      text: noteText.trim(),
      kind,
      ...(mode === 'code' ? { code } : { contact }),
    };
    const { ok, data } = await submitRepairFollowUp(payload);
    if (!ok) {
      setError(data.error || '反馈失败');
      return;
    }
    setRecords((prev) => (prev || []).map((item) => (item.id === record.id ? data : item)));
    setNoteFor('');
    setNoteText('');
    setTip('反馈已提交，管理员会看到这条反馈');
  };

  return (
    <div className="page">
      <section className="panel">
        <div className="module-form-head">
          <h2>查询报修进度</h2>
        </div>

        <div className="query-tabs">
          <button
            type="button"
            className={mode === 'code' ? 'is-active' : ''}
            onClick={() => setMode('code')}
          >
            用查询码查询
          </button>
          <button
            type="button"
            className={mode === 'contact' ? 'is-active' : ''}
            onClick={() => setMode('contact')}
          >
            用手机号查询
          </button>
        </div>

        <form className="query-form" onSubmit={search}>
          {mode === 'code' ? (
            <label>
              查询码
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="例：A7K3M9（提交成功时展示）"
                maxLength={12}
                required
              />
            </label>
          ) : (
            <label>
              手机号
              <input
                value={contact}
                onChange={(event) => setContact(event.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="提交时填写的手机号"
                inputMode="numeric"
                maxLength={11}
                required
              />
            </label>
          )}
          <button type="submit" className="primary-btn" disabled={busy}>
            {busy ? '查询中…' : '查询'}
          </button>
        </form>

        {error ? <p className="message">{error}</p> : null}
        {tip ? <p className="query-tip">{tip}</p> : null}

        {records && records.length === 0 ? (
          <p className="empty">没有查到相关工单，请核对查询码或手机号是否与提交时一致。</p>
        ) : null}

        {records && records.length > 0 ? (
          <div className="record-list">
            {records.map((item) => {
              const status = normalizeRepairStatus(item.status);
              const done = status === '已完成';
              const followUps = Array.isArray(item.followUps) ? item.followUps : [];
              return (
                <article key={item.id} className="record-card">
                  <div className="record-head">
                    <span>{formatRepairLocation(item) || '—'}</span>
                    <span className={`status ${REPAIR_STATUS_CLASS[status] || 'pending'}`}>{status}</span>
                  </div>

                  <RepairSteps status={status} />

                  <p>故障类型：{item.category || '—'}</p>
                  <p>问题描述：{item.description || '—'}</p>
                  <p>提交时间：{formatDateTime(item.createdAt)}</p>
                  {done ? (
                    <>
                      <p>处理时间：{formatDateTime(item.handledAt)}</p>
                      <p>处理说明：{item.feedback || '管理员未填写说明'}</p>
                    </>
                  ) : null}

                  {followUps.length ? (
                    <div className="follow-ups">
                      <p className="follow-ups-title">我的反馈（{followUps.length} 条）</p>
                      {followUps.map((feedback) => (
                        <p key={feedback.id} className="follow-up-item">
                          <span className="follow-up-kind">{feedback.kind === 'urge' ? '催办' : '仍未解决'}</span>
                          {feedback.text}
                          <small>（{formatDateTime(feedback.at)}）</small>
                        </p>
                      ))}
                    </div>
                  ) : null}

                  {noteFor === item.id ? (
                    <div className="follow-up-form">
                      <textarea
                        rows="2"
                        maxLength={200}
                        value={noteText}
                        placeholder={done ? '问题仍未解决？说明具体情况，管理员会看到' : '还没处理？可说明情况催办'}
                        onChange={(event) => setNoteText(event.target.value)}
                      />
                      <div className="follow-up-actions">
                        <button type="button" className="confirm-cancel" onClick={() => setNoteFor('')}>
                          取消
                        </button>
                        <button type="button" onClick={() => sendFollowUp(item, done ? 'unsolved' : 'urge')}>
                          提交反馈
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="manager-actions">
                      <button type="button" onClick={() => { setNoteFor(item.id); setNoteText(''); setError(''); }}>
                        {done ? '问题仍未解决' : '仍未处理，我要反馈'}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : null}
      </section>
    </div>
  );
}