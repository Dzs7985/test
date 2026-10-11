import { useEffect, useState } from 'react';
import StatusToast from '../components/StatusToast';
import { useNotice } from '../hooks/useNotice';
import { claimLostItem, fetchLostItems } from '../lib/api';
import { formatDateTime } from '../lib/constants';

const STATUS_LABEL = {
  待认领: 'pending',
  已认领: 'done',
};

/** 申请取回弹窗：姓名 + 11 位手机号 + 认领说明；提交成功后展示认领密码 */
function ClaimDialog({ item, onClose, onDone }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [claimCode, setClaimCode] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!name.trim()) return setError('请填写您的姓名');
    if (!/^[0-9]{11}$/.test(contact.trim())) return setError('请填写 11 位手机号');
    setSubmitting(true);
    const { ok, data } = await claimLostItem(item.id, { name, contact, message });
    setSubmitting(false);
    if (!ok) return setError(data?.error || '提交失败，请重试');
    // 认领密码仅展示一次，请学生牢记
    setClaimCode(data.claimCode || '');
  };

  if (claimCode) {
    return (
      <div className="claim-overlay" onClick={onClose}>
        <div className="claim-dialog" onClick={(event) => event.stopPropagation()}>
          <h3>申请已提交</h3>
          <p className="claim-tip">
            请牢记以下 <strong>认领密码</strong>，领取物品时需向管理员出示，验证通过后方可取回。
          </p>
          <div className="claim-code-box">
            <span className="claim-code-label">认领密码</span>
            <span className="claim-code">{claimCode}</span>
          </div>
          <p className="claim-code-warn">密码仅显示一次，请截图或记牢，关闭后无法再次查看。</p>
          <div className="claim-actions">
            <button type="button" className="primary-btn" onClick={onDone}>
              我已记牢
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="claim-overlay" onClick={onClose}>
      <div className="claim-dialog" onClick={(event) => event.stopPropagation()}>
        <h3>申请取回「{item.name}」</h3>
        <p className="claim-tip">
          请如实填写信息，提交后会生成认领密码，领取时需向管理员出示。
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            姓名
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="请输入您的真实姓名"
              required
            />
          </label>
          <label>
            联系方式
            <input
              value={contact}
              onChange={(event) => setContact(event.target.value.replace(/\D/g, '').slice(0, 11))}
              inputMode="numeric"
              maxLength={11}
              placeholder="11 位手机号"
              required
            />
          </label>
          <label>
            认领说明（可选）
            <textarea
              rows="3"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="描述物品特征以帮助管理员核实归属"
            />
          </label>
          {error ? <p className="claim-error">{error}</p> : null}
          <div className="claim-actions">
            <button type="button" className="secondary-btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary-btn" disabled={submitting}>
              {submitting ? '提交中…' : '提交申请'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** 失物招领公开页：师生无需登录即可浏览拾获物品并申请取回 */
export default function LostAndFoundPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(null);
  const { notice, notify, clearNotice } = useNotice();

  const load = async () => {
    setLoading(true);
    const { ok, data } = await fetchLostItems();
    setLoading(false);
    if (!ok) {
      setError('加载失败，请稍后重试');
      return;
    }
    setItems(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    load();
  }, []);

  const handleClaimDone = () => {
    notify('申请已提交，管理员核实后会与您联系', 'success');
    setClaiming(null);
    load();
  };

  return (
    <div className="page lost-page">
      <StatusToast notice={notice} onClose={clearNotice} />

      <section className="panel">
        <h2>失物招领</h2>
        <p className="lost-intro">
          这里展示管理员拾获并登记的物品。如果看到您丢失的东西，点击「申请取回」填写信息，管理员核实后会联系您领取。
        </p>

        {error ? <p className="message" style={{ color: '#dc2626' }}>{error}</p> : null}

        {loading ? (
          <p className="empty">加载中…</p>
        ) : items.length === 0 ? (
          <p className="empty">暂无拾获物品登记。</p>
        ) : (
          <div className="lost-grid">
            {items.map((item) => (
              <article key={item.id} className="lost-card">
                <div className="lost-image-wrap">
                  {item.image ? (
                    <img src={item.image} alt={item.name} className="lost-image" />
                  ) : (
                    <div className="lost-image-placeholder">暂无图片</div>
                  )}
                  <span className={`status ${STATUS_LABEL[item.status] || 'pending'}`}>
                    {item.status}
                  </span>
                </div>
                <div className="lost-body">
                  <h3 className="lost-name">{item.name}</h3>
                  {item.description ? <p className="lost-desc">{item.description}</p> : null}
                  {item.location ? <p className="lost-meta">拾获地点：{item.location}</p> : null}
                  <p className="lost-meta">登记时间：{formatDateTime(item.createdAt)}</p>
                  {item.status === '已认领' ? (
                    <button type="button" className="secondary-btn" disabled>
                      已被认领
                    </button>
                  ) : (
                    <button type="button" className="primary-btn" onClick={() => setClaiming(item)}>
                      申请取回
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {claiming ? (
        <ClaimDialog item={claiming} onClose={() => setClaiming(null)} onDone={handleClaimDone} />
      ) : null}
    </div>
  );
}
