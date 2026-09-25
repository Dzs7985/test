import { useEffect, useMemo, useState } from 'react';
import ChangePasswordDialog from '../components/ChangePasswordDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import StatusToast from '../components/StatusToast';
import { useConfirm } from '../hooks/useConfirm';
import { useNotice } from '../hooks/useNotice';
import { submitRepair } from '../lib/api';
import { defaultCampusOptions, initialForm, MAX_LOGIN_ATTEMPTS, repairCategories } from '../lib/constants';
import MyRepairs from './students/MyRepairs';
import StudentLoginForm from './students/StudentLoginForm';

const sessionKey = 'dormStudentSession';
/** 保存最近一次报修使用的姓名 / 联系方式，用于「我的报修」自动识别本人 */
const identityKey = 'dormStudentIdentity';

const readStoredSession = () => {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.token && parsed.role === 'student' ? parsed : null;
  } catch {
    return null;
  }
};

const clearStoredSession = () => {
  localStorage.removeItem(sessionKey);
};

export default function StudentPage({ config }) {
  const [session, setSession] = useState(readStoredSession);
  const [loginErr, setLoginErr] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [pwdOpen, setPwdOpen] = useState(false);
  const { notice, notify, clearNotice } = useNotice();

  const [form, setForm] = useState(initialForm);
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('submit');
  const [identity, setIdentity] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(identityKey)) || { name: '', contact: '' };
    } catch {
      return { name: '', contact: '' };
    }
  });
  const { dialogProps, confirm, handleConfirm, handleCancel } = useConfirm();

  const campuses = config?.campuses || defaultCampusOptions;

  /** 保存本人识别信息（姓名+联系方式），供报修表单预填与「我的报修」查询 */
  const saveIdentity = (next) => {
    const value = { name: next.name || '', contact: next.contact || '' };
    setIdentity(value);
    localStorage.setItem(identityKey, JSON.stringify(value));
  };

  // 登录成功：会话固定存 localStorage，关掉浏览器再打开仍是登录状态
  const handleLoginSuccess = (data) => {
    const next = { token: data.token, role: data.role, username: data.username || '' };
    localStorage.setItem(sessionKey, JSON.stringify(next));
    setSession(next);
    setLoginErr('');
    setAttempts(0);
  };

  const handleLoginFailure = (text) => {
    setLoginErr(text);
    setAttempts((value) => Math.min(value + 1, MAX_LOGIN_ATTEMPTS));
  };

  const handleAuthLost = () => {
    clearStoredSession();
    setSession(null);
    setLoginErr('登录状态已失效，请重新登录');
  };

  const handleLogout = () => {
    clearStoredSession();
    setSession(null);
    setLoginErr('');
    setAttempts(0);
    setMessage('');
  };

  useEffect(() => {
    if (!config) return;
    setForm((prev) => ({
      ...prev,
      campus: config.campuses?.includes(prev.campus) ? prev.campus : '',
      building:
        prev.campus && config.campusBuildings?.[prev.campus]?.includes(prev.building) ? prev.building : '',
    }));
  }, [config]);

  // 登录后用上次的姓名 / 联系方式预填报修表单，减少重复输入
  useEffect(() => {
    if (session && (identity.name || identity.contact)) {
      setForm((prev) => ({ ...prev, name: identity.name, contact: identity.contact }));
    }
    // 仅在登录态变化时预填一次，不覆盖用户正在编辑的内容
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const buildingOptions = useMemo(() => {
    if (!form.campus) return [];
    return config?.campusBuildings?.[form.campus] || [];
  }, [config, form.campus]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === 'contact' ? value.replace(/\D/g, '').slice(0, 11) : value;
    setForm((prev) => ({
      ...prev,
      [name]: nextValue,
      ...(name === 'campus' ? { building: '' } : {}),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // 提交前二次确认：把关键信息回显一遍，避免误填或误点直接提交
    const location = [form.campus, form.building, form.roomNumber].filter(Boolean).join(' / ');
    const confirmed = await confirm(
      `请确认信息无误：${location}｜故障类型：${form.category}。确认后将提交给对应楼号的宿管处理。`,
      { title: '确认提交报修', confirmText: '确认提交' },
    );
    if (!confirmed) return;

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    if (image) payload.append('image', image);

    const { ok, status, data } = await submitRepair(payload, session?.token);
    if (!ok) {
      // 登录态失效（如改密后旧会话被踢）：回到登录页，不留在可提交的假象里
      if (status === 403) {
        handleAuthLost();
        return;
      }
      setMessage(data.error || '提交失败');
      return;
    }

    notify('报修提交成功，已进入未完成列表，可在「我的报修」查看进度', 'success');
    // 记住本人信息并跳到「我的报修」，可立即看到新工单状态
    saveIdentity({ name: form.name, contact: form.contact });
    setForm({ ...initialForm, name: form.name, contact: form.contact });
    setImage(null);
    setActiveTab('mine');
  };

  return (
    <div className="page">
      <StatusToast notice={notice} onClose={clearNotice} />
      <section className="panel">
        {session ? (
          <div>
            {/* 账号操作统一放在右上角：修改密码与登出并排 */}
            <div className="manager-toolbar">
              <button type="button" className="secondary-btn" onClick={() => setPwdOpen(true)}>
                修改密码
              </button>
              <button type="button" className="primary-btn" onClick={handleLogout}>
                登出
              </button>
            </div>

            {/* 学生功能页签：提交报修 / 我的报修 */}
            <div className="student-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'submit'}
                className={'student-tab' + (activeTab === 'submit' ? ' is-active' : '')}
                onClick={() => setActiveTab('submit')}
              >
                提交报修
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'mine'}
                className={'student-tab' + (activeTab === 'mine' ? ' is-active' : '')}
                onClick={() => setActiveTab('mine')}
              >
                我的报修
              </button>
            </div>

            {activeTab === 'submit' ? (
              <>
                <h2>学生提交报修</h2>
                <form onSubmit={handleSubmit} className="repair-form">
              <div className="field-row">
                <label>
                  姓名
                  <input name="name" value={form.name} onChange={handleChange} placeholder="必填" required />
                </label>
                <label>
                  联系方式
                  <input
                    name="contact"
                    value={form.contact}
                    onChange={handleChange}
                    placeholder="例：13800000000（必填）"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={11}
                    required
                  />
                </label>
              </div>

              <div className="field-row">
                <label>
                  校区
                  <select name="campus" value={form.campus} onChange={handleChange} required>
                    <option value="">请选择（必选）</option>
                    {campuses.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  楼号
                  <select
                    name="building"
                    value={form.building}
                    onChange={handleChange}
                    required
                    disabled={!form.campus}
                  >
                    <option value="">{form.campus ? '请选择（必选）' : '请先选择校区'}</option>
                    {buildingOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field-row">
                <label>
                  房间号
                  <input name="roomNumber" value={form.roomNumber} onChange={handleChange} placeholder="必填" required />
                </label>
                <div />
              </div>

              <div className="field-row">
                <label>
                  故障类型
                  <select name="category" value={form.category} onChange={handleChange} required>
                    <option value="">请选择（必选）</option>
                    {repairCategories.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <div />
              </div>

              <label>
                问题描述
                <textarea
                  name="description"
                  rows="4"
                  value={form.description}
                  onChange={handleChange}
                  placeholder="请简要描述问题（必填）"
                  required
                />
              </label>

              <label>
                上传照片（可选）
                <input type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] || null)} />
              </label>

              <button type="submit" className="primary-btn">
                提交报修
              </button>
              {message ? <p className="message">{message}</p> : null}
            </form>
              </>
            ) : (
              <MyRepairs token={session.token} identity={identity} onIdentityChange={saveIdentity} />
            )}
          </div>
        ) : (
          <StudentLoginForm
            error={loginErr}
            attempts={attempts}
            onClearError={() => setLoginErr('')}
            onFailure={handleLoginFailure}
            onSuccess={handleLoginSuccess}
          />
        )}
      </section>

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

      <ChangePasswordDialog
        open={pwdOpen}
        token={session?.token}
        onClose={() => setPwdOpen(false)}
        onDone={(msg) => notify(msg, 'success')}
      />
    </div>
  );
}
