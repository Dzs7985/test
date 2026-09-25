import { useState } from 'react';
import AlnumInput from '../../components/AlnumInput';
import Logo from '../../components/Logo';
import PasswordField from '../../components/PasswordField';
import { login } from '../../lib/api';
import { MAX_LOGIN_ATTEMPTS } from '../../lib/constants';

export default function LoginForm({
  campuses = [],
  emergencyPhone = '',
  error,
  attempts,
  onClearError,
  onFailure,
  onSuccess,
}) {
  const [campus, setCampus] = useState('');
  // 勾选「管理员」即按管理员登录（管理员是全局账号，不需要选校区），不必再在校区项里选角色
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // 「忘记密码」只做提示，不发起任何请求：直接告诉学生联系哪个电话
  const [forgotOpen, setForgotOpen] = useState(false);

  const locked = attempts >= MAX_LOGIN_ATTEMPTS;

  const handleSubmit = async (event) => {
    event.preventDefault();
    onClearError();

    if (locked) {
      onFailure('尝试次数过多，请稍后再试');
      return;
    }

    const { ok, data } = await login(username, password, isAdmin ? '' : campus);
    if (!ok) {
      onFailure(data.error || '登录失败');
      return;
    }

    onSuccess(data);
  };

  return (
    <form onSubmit={handleSubmit} className="login-form">
      <div className="login-head">
        <Logo size={68} className="login-logo" />
        <h2 className="login-title">宿舍报修系统</h2>
        <p className="login-sub">宿管 / 管理员登录</p>
      </div>

      <div className="campus-field">
        <span>校区</span>
        <div className="campus-row">
          <select
            name="campus"
            value={campus}
            disabled={isAdmin}
            onChange={(event) => setCampus(event.target.value)}
          >
            <option value="">请选择校区</option>
            {campuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <label className="admin-check">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(event) => setIsAdmin(event.target.checked)}
            />
            管理员
          </label>
        </div>
      </div>

      <label>
        账号
        <AlnumInput name="username" value={username} onChange={setUsername} />
      </label>

      <label>
        密码
        <PasswordField value={password} onChange={setPassword} />
      </label>

      <div className="login-actions">
        <button type="submit" className="primary-btn" disabled={locked}>
          登录
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => setForgotOpen((value) => !value)}
          aria-expanded={forgotOpen}
        >
          忘记密码？
        </button>
      </div>

      {forgotOpen ? (
        <p className="forgot-tip">
          {emergencyPhone
            ? `宿管忘记密码请联系管理员重置，紧急联系电话：${emergencyPhone}`
            : '宿管忘记密码请联系管理员重置（管理员尚未在后台填写紧急联系电话）'}
        </p>
      ) : null}

      {error ? (
        <p className="message" style={{ color: '#dc2626' }}>
          {error}
        </p>
      ) : null}
      {attempts > 0 ? (
        <p className="message">
          登录失败次数：{attempts}（达到 {MAX_LOGIN_ATTEMPTS} 次将禁止登录）
        </p>
      ) : null}
    </form>
  );
}