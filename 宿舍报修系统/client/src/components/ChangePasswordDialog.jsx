import { useEffect, useState } from 'react';
import { changeOwnPassword } from '../lib/api';
import PasswordField from './PasswordField';

/**
 * 修改自己的密码（管理员与宿管共用）。
 * 两步走：先填「原密码 / 新密码 / 确认新密码」，再进入二次确认页核对信息后才提交，
 * 避免改错密码后自己登不进来。
 */
export default function ChangePasswordDialog({ open, token, onClose, onDone }) {
  const [step, setStep] = useState('form');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 每次打开都从空白开始，不残留上一次输入的密码
  useEffect(() => {
    if (!open) return;
    setStep('form');
    setOldPassword('');
    setNewPassword('');
    setRepeatPassword('');
    setError('');
    setBusy(false);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const goConfirm = (event) => {
    event.preventDefault();
    if (!oldPassword || !newPassword) {
      setError('请填写原密码与新密码');
      return;
    }
    if (newPassword !== repeatPassword) {
      setError('两次输入的新密码不一致');
      return;
    }
    if (newPassword === oldPassword) {
      setError('新密码不能与原密码相同');
      return;
    }
    setError('');
    setStep('confirm');
  };

  const submit = async () => {
    setBusy(true);
    const { ok, data } = await changeOwnPassword(oldPassword, newPassword, token);
    setBusy(false);
    if (!ok) {
      setError(data.error || '密码修改失败');
      setStep('form');
      return;
    }
    onDone(data.message || '密码修改成功');
    onClose();
  };

  return (
    <div className="confirm-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="confirm-dialog pwd-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="confirm-title">修改密码</div>

        {step === 'form' ? (
          <form onSubmit={goConfirm}>
            <label className="pwd-field">
              原密码
              <PasswordField value={oldPassword} onChange={setOldPassword} autoFocus />
            </label>
            <label className="pwd-field">
              新密码
              <PasswordField value={newPassword} onChange={setNewPassword} />
            </label>
            <label className="pwd-field">
              确认新密码
              <PasswordField value={repeatPassword} onChange={setRepeatPassword} />
            </label>
            <p className="pwd-hint">密码仅允许字母与数字。</p>

            {error ? <p className="pwd-error">{error}</p> : null}

            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={onClose}>
                取消
              </button>
              <button type="submit" className="confirm-ok">
                下一步
              </button>
            </div>
          </form>
        ) : (
          <div>
            <div className="confirm-message">
              请确认密码修改：
              <br />
              原密码：{oldPassword}
              <br />
              新密码：{newPassword}
              <br />
              修改后请用新密码登录，确认无误后再提交。
            </div>

            {error ? <p className="pwd-error">{error}</p> : null}

            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={() => setStep('form')} disabled={busy}>
                返回修改
              </button>
              <button type="button" className="confirm-ok" onClick={submit} disabled={busy}>
                {busy ? '提交中…' : '确认修改'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}