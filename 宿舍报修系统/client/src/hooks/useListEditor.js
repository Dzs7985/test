import { useCallback, useState } from 'react';

/**
 * 列表项的行内编辑态（校区列表、楼号列表共用）：
 * index 为 -1 表示当前没有行处于编辑态。
 */
export function useListEditor() {
  const [index, setIndex] = useState(-1);
  const [value, setValue] = useState('');

  const start = useCallback((nextIndex, nextValue) => {
    setIndex(nextIndex);
    setValue(nextValue);
  }, []);

  const change = useCallback((nextValue) => setValue(nextValue), []);

  const cancel = useCallback(() => {
    setIndex(-1);
    setValue('');
  }, []);

  return { index, value, start, change, cancel };
}