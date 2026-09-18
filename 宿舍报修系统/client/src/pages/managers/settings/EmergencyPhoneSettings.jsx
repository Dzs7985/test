import { useEffect, useState } from 'react';

/**
 * 紧急联系电话设置：登录页点「忘记密码」时会提示学生联系这个号码。
 * 与「修改」按钮一致，默认查看态，点「修改」后才可编辑，避免误改。
 */
export default function EmergencyPhoneSettings({ campus }) {
  const [draft, setDraft] = useState(campus.emergencyPhone || '');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(campus.emergencyPhone || '');
    setEditing(false);
  }, [campus.emergencyPhone]);

  const handleSave = async () => {
    const ok = await campus.saveEmergencyPhone(draft);
    if (ok) setEditing(false);
  };

  return (
    <div className="account-col emergency-phone">
      <h4 className="account-title">紧急联系电话</h4>
      <label className="account-field">
        联系电话
        <input
          type="text"
          inputMode="numeric"
          maxLength={11}
          value={draft}
          readOnly={!editing}
          placeholder="11 位手机号"
          aria-label="紧急联系电话"
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
        />
      </label>

      {editing ? (
        <button className="primary-btn" type="button" onClick={handleSave}>
          保存
        </button>
      ) : (
        <button className="secondary-btn" type="button" onClick={() => setEditing(true)}>
          修改
        </button>
      )}

      <p className="account-hint">
        登录页点「忘记密码」时会提示宿管联系该号码（学生没有账号、无需登录）。请填写 11 位手机号；留空则不显示号码。
      </p>
    </div>
  );
}