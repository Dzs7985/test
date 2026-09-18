import { useState } from 'react';
import { sanitizeAlphaNumeric } from '../lib/constants';

/**
 * 只允许字母与数字的输入框，并正确处理中文输入法（IME）组合态，
 * 避免拼音上屏过程中被过滤掉。登录、账号新增/修改等场景共用。
 */
export default function AlnumInput({ value, onChange, ...rest }) {
  const [composing, setComposing] = useState(false);

  return (
    <input
      {...rest}
      spellCheck={false}
      value={value}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={(event) => {
        setComposing(false);
        onChange(sanitizeAlphaNumeric(event.target.value));
      }}
      onBlur={(event) => onChange(sanitizeAlphaNumeric(event.target.value))}
      onChange={(event) => {
        const next = event.target.value || '';
        if (event.nativeEvent?.isComposing || composing) {
          onChange(next);
          return;
        }
        onChange(sanitizeAlphaNumeric(next));
      }}
    />
  );
}