import { useCallback, useEffect, useState } from 'react';

/**
 * 统一的操作反馈提示：notify(text, tone) 展示，超时自动消失。
 * tone: 'success' | 'error'
 */
export function useNotice(timeout = 4000) {
  const [notice, setNotice] = useState(null);

  const notify = useCallback((text, tone = 'success') => {
    if (!text) return;
    setNotice({ text, tone });
  }, []);

  const clearNotice = useCallback(() => setNotice(null), []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), timeout);
    return () => clearTimeout(timer);
  }, [notice, timeout]);

  return { notice, notify, clearNotice };
}