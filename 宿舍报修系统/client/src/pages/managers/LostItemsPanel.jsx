import { useEffect, useState } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import StatusToast from '../../components/StatusToast';
import { useConfirm } from '../../hooks/useConfirm';
import { useNotice } from '../../hooks/useNotice';
import {
  createLostItem,
  deleteLostItem,
  fetchLostItems,
  updateLostItemStatus,
} from '../../lib/api';
import { formatDateTime } from '../../lib/constants';

const STATUS_CLASS = {
  待认领: 'pending',
  已认领: 'done',
};

/** 发布拾获物品表单：名称、描述、拾获地点、照片 */
function PublishForm({ onDone, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [image, setImage] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (!name.trim()) return setError('请填写物品名称');
    if (!image) return setError('请上传物品照片');

    const formData = new FormData();
    formData.append('name', name.trim());
    formData.append('description', description.trim());
    formData.append('location', location.trim());
    formData.append('image', image);

    setSubmitting(true);
    const token = JSON.parse(localStorage.getItem('dormSession') || '{}').token;
    const { ok, data } = await createLostItem(formData, token);
    setSubmitting(false);
    if (!ok) return setError(data?.error || '发布失败，请重试');
    onDone();
  };

  return (
    <div className="lost-admin-form">
      <h3>发布拾获物品</h3>
      <form onSubmit={handleSubmit}>
        <label>
          物品名称
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：黑色雨伞" required />
        </label>
        <label>
          详细描述（可选）
          <textarea
            rows="2"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="物品的颜色、品牌、特征等"
          />
        </label>
        <label>
          拾获地点
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="如：图书馆二楼自习室" />
        </label>
        <label className="lost-upload-field">
          物品照片
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files?.[0] || null)}
          />
          {image ? <span className="lost-file-name">已选择：{image.name}</span> : null}
        </label>
        {error ? <p className="lost-form-error">{error}</p> : null}
        <div className="lost-form-actions">
          <button type="button" className="secondary-btn" onClick={onCancel}>
            取消
          </button>
          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? '发布中…' : '发布'}
          </button>
        </div>
      </form>
    </div>
  );
}

/** 管理员失物招领管理：发布物品、查看认领申请、标记已认领、删除 */
export default function LostItemsPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [claimTarget, setClaimTarget] = useState(null);
  const [claimCodeInput, setClaimCodeInput] = useState('');
  const [claimError, setClaimError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const { notice, notify, clearNotice } = useNotice();
  const { dialogProps, confirm, handleConfirm, handleCancel } = useConfirm();

  const token = JSON.parse(localStorage.getItem('dormSession') || '{}').token;

  const load = async () => {
    setLoading(true);
    const { ok, data } = await fetchLostItems(token);
    setLoading(false);
    if (ok) setItems(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    load();
  }, []);

  const handlePublishDone = () => {
    notify('物品发布成功', 'success');
    setShowForm(false);
    load();
  };

  const openClaimDialog = (item) => {
    setClaimTarget(item);
    setClaimCodeInput('');
    setClaimError('');
  };

  const closeClaimDialog = () => {
    setClaimTarget(null);
    setClaimCodeInput('');
    setClaimError('');
  };

  const handleConfirmClaim = async () => {
    setClaimError('');
    const code = claimCodeInput.trim();
    if (!/^\d{6}$/.test(code)) {
      setClaimError('请输入 6 位数字认领密码');
      return;
    }
    setClaiming(true);
    const { ok, data } = await updateLostItemStatus(claimTarget.id, '已认领', token, code);
    setClaiming(false);
    if (!ok) {
      setClaimError(data?.error || '认领失败');
      return;
    }
    notify('认领密码验证通过，已标记为已认领', 'success');
    closeClaimDialog();
    load();
  };

  const handleDelete = async (item) => {
    const ok = await confirm(`确认删除「${item.name}」？会移入回收站，可在保留期内恢复。`, {
      title: '删除物品',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    const { ok: resOk, data } = await deleteLostItem(item.id, token);
    if (!resOk) {
      notify(data?.error || '删除失败', 'error');
      return;
    }
    notify('已移入回收站，可在回收站恢复', 'success');
    load();
  };

  return (
    <div className="lost-admin">
      <StatusToast notice={notice} onClose={clearNotice} />

      <div className="lost-admin-head">
        <h2>失物招领管理</h2>
        <button type="button" className="primary-btn" onClick={() => setShowForm((v) => !v)}>
          {showForm ? '收起表单' : '发布拾获物品'}
        </button>
      </div>

      {showForm ? <PublishForm onDone={handlePublishDone} onCancel={() => setShowForm(false)} /> : null}

      {loading ? (
        <p className="empty">加载中…</p>
      ) : items.length === 0 ? (
        <p className="empty">暂无拾获物品，点击上方按钮发布第一件。</p>
      ) : (
        <div className="lost-admin-list">
          {items.map((item) => {
            const expanded = expandedId === item.id;
            const claims = Array.isArray(item.claims) ? item.claims : [];
            return (
              <article key={item.id} className="lost-admin-item">
                <div className="lost-admin-thumb">
                  {item.image ? (
                    <img src={item.image} alt={item.name} />
                  ) : (
                    <div className="lost-thumb-placeholder">无图</div>
                  )}
                </div>
                <div className="lost-admin-info">
                  <div className="lost-admin-title">
                    <h3>{item.name}</h3>
                    <span className={`status ${STATUS_CLASS[item.status] || 'pending'}`}>{item.status}</span>
                  </div>
                  {item.description ? <p className="lost-desc">{item.description}</p> : null}
                  {item.location ? <p className="lost-meta">拾获地点：{item.location}</p> : null}
                  <p className="lost-meta">登记时间：{formatDateTime(item.createdAt)}</p>
                  <div className="lost-admin-actions">
                    {item.status !== '已认领' ? (
                      <button type="button" className="secondary-btn" onClick={() => openClaimDialog(item)}>
                        标记已认领
                      </button>
                    ) : null}
                    <button type="button" className="lost-claim-toggle" onClick={() => setExpandedId(expanded ? null : item.id)}>
                      认领申请（{claims.length}）{expanded ? ' ▲' : ' ▼'}
                    </button>
                    <button type="button" className="lost-delete-btn" onClick={() => handleDelete(item)}>
                      删除
                    </button>
                  </div>
                  {expanded ? (
                    <div className="lost-claims">
                      {claims.length === 0 ? (
                        <p className="empty">暂无认领申请</p>
                      ) : (
                        claims.map((claim) => (
                          <div key={claim.id} className="lost-claim-item">
                            <div className="lost-claim-head">
                              <strong>{claim.name}</strong>
                              <span>{claim.contact}</span>
                            </div>
                            {claim.message ? <p>{claim.message}</p> : null}
                            <span className="lost-claim-time">{formatDateTime(claim.createdAt)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 标记已认领：需输入学生的 6 位认领密码，校验通过才成功 */}
      {claimTarget ? (
        <div className="claim-overlay" onClick={closeClaimDialog}>
          <div className="claim-dialog" onClick={(event) => event.stopPropagation()}>
            <h3>标记已认领</h3>
            <p className="claim-tip">
              请输入「{claimTarget.name}」申请人提供的 6 位认领密码，验证通过后方可完成认领。
            </p>
            <label>
              认领密码
              <input
                value={claimCodeInput}
                onChange={(event) => setClaimCodeInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
                placeholder="6 位数字密码"
                autoFocus
              />
            </label>
            {claimError ? <p className="claim-error">{claimError}</p> : null}
            <div className="claim-actions">
              <button type="button" className="secondary-btn" onClick={closeClaimDialog}>
                取消
              </button>
              <button type="button" className="primary-btn" onClick={handleConfirmClaim} disabled={claiming}>
                {claiming ? '验证中…' : '确认认领'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={dialogProps.open}
        title={dialogProps.title}
        message={dialogProps.message}
        confirmText={dialogProps.confirmText}
        cancelText={dialogProps.cancelText}
        danger={dialogProps.danger}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}
