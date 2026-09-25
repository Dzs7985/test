import { useState } from 'react';
import AlnumInput from '../../components/AlnumInput';
import Logo from '../../components/Logo';
import PasswordField from '../../components/PasswordField';
import { login } from '../../lib/api';
import { MAX_LOGIN_ATTEMPTS } from '../../lib/constants';

/**
 * 学生登录表单：只需账号与密码（学生是全局账号，不区分校区）。
 * 初始账号 / 密码均为 123456，登录后可在报修页修改密码。
 */
export default function StudentLoginForm({ error, attempts, onClearError, onFailure, onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const locked = attempts >= MAX_LOGIN_ATTEMPTS;

  const handleSubmit = async (event) => {
    event.preventDefault();
    onClearError();

    if (locked) {
      onFailure('尝试次数过多，请稍后再试');
      return;
    }

    const { ok, data } = await login(username, password, '', 'student');
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
        <p className="login-sub">学生登录</p>
      </div>

      <label>
        账号
        <AlnumInput name="username" value={username} onChange={setUsername} placeholder="请输入学生账号" />
      </label>

      <label>
        密码
        <PasswordField value={password} onChange={setPassword} />
      </label>

      <div className="login-actions">
        <button type="submit" className="primary-btn" disabled={locked}>
          登录
        </button>
      </div>

      <p className="login-tip">初始账号与密码均为 123456，登录后请及时修改密码。</p>

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
