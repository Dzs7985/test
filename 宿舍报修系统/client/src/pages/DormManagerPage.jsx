import { useState } from 'react';
import ChangePasswordDialog from '../components/ChangePasswordDialog';
import StatusToast from '../components/StatusToast';
import { useNotice } from '../hooks/useNotice';
import { MAX_LOGIN_ATTEMPTS } from '../lib/constants';
import LoginForm from './managers/LoginForm';
import ManagerRepairsPanel from './managers/ManagerRepairsPanel';
import ManagersPanel from './managers/ManagersPanel';

const sessionKey = 'dormSession';

const readStoredSession = () => {
  const raw = localStorage.getItem(sessionKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && parsed.token ? parsed : null;
  } catch {
    return null;
  }
};

const clearStoredSession = () => {
  localStorage.removeItem(sessionKey);
};

export default function DormManagerPage({ config }) {
  const [session, setSession] = useState(readStoredSession);
  const [loginErr, setLoginErr] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [pwdOpen, setPwdOpen] = useState(false);
  const { notice, notify, clearNotice } = useNotice();

  // 登录接口会返回角色：admin 进管理面板，宿管只进自己楼号的工单面板
  // 登录态固定存 localStorage：关掉浏览器、下次打开仍是登录状态，不用反复输账号密码
  const handleSuccess = (data) => {
    const next = {
      token: data.token,
      role: data.role,
      username: data.username || '',
      campus: data.campus || '',
      building: data.building || '',
    };
    localStorage.setItem(sessionKey, JSON.stringify(next));
    setSession(next);
    setLoginErr('');
    setAttempts(0);
  };

  const handleFailure = (message) => {
    setLoginErr(message);
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
  };

  const isAdmin = session?.role === 'admin';

  return (
    <div className="page">
      <StatusToast notice={notice} onClose={clearNotice} />
      <section className="panel">
        {session ? (
          <div>
            {/* 账号相关的操作统一放在右上角：修改密码与登出并排 */}
            <div className="manager-toolbar">
              <button type="button" className="secondary-btn" onClick={() => setPwdOpen(true)}>
                修改密码
              </button>
              <button type="button" className="primary-btn" onClick={handleLogout}>
                登出
              </button>
            </div>
            {isAdmin ? (
              <ManagersPanel adminToken={session.token} config={config} onAuthLost={handleAuthLost} />
            ) : (
              <ManagerRepairsPanel session={session} onAuthLost={handleAuthLost} />
            )}
          </div>
        ) : (
          <LoginForm
            campuses={config?.campuses || []}
            emergencyPhone={config?.emergencyPhone || ''}
            error={loginErr}
            attempts={attempts}
            onClearError={() => setLoginErr('')}
            onFailure={handleFailure}
            onSuccess={handleSuccess}
          />
        )}
      </section>

      <ChangePasswordDialog
        open={pwdOpen}
        token={session?.token}
        onClose={() => setPwdOpen(false)}
        onDone={(message) => notify(message, 'success')}
      />
    </div>
  );
}