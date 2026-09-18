import { useState } from 'react';
import AlnumInput from './AlnumInput';

/**
 * 带「显示/隐藏」切换的密码输入框（登录、改密共用）。
 * value/onChange 用法与普通输入框一致，额外支持 placeholder、autoFocus。
 */
export default function PasswordField({ value, onChange, placeholder = '', autoFocus = false }) {
  const [showPwd, setShowPwd] = useState(false);
  const inputType = showPwd ? 'text' : 'password';

  return (
    <div className="pwd-wrapper">
      <AlnumInput
        type={inputType}
        value={value}
        onChange={onChange}
        className="pwd-input"
        autoFocus={autoFocus}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="toggle-eye"
        onClick={() => setShowPwd((value) => !value)}
        aria-label={showPwd ? '隐藏密码' : '显示密码'}
      >
        {showPwd ? (
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="20" height="20">
            <path
              d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" width="20" height="20">
            <path
              d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" fill="currentColor" />
            <line x1="5" y1="19" x2="19" y2="5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>
    </div>
  );
}