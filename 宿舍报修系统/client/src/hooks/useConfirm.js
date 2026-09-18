import { useCallback, useState } from 'react';

/**
 * 受控的确认对话框：confirm(message, { title, confirmText, cancelText, danger }) 返回 Promise<boolean>。
 * 调用方通过 <ConfirmDialog {...dialogProps} /> 在顶层渲染。
 */
export function useConfirm() {
  const [dialogProps, setDialogProps] = useState({ open: false });

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setDialogProps({
        open: true,
        message,
        title: options.title || '确认操作',
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        danger: Boolean(options.danger),
        onResolve: resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const { onResolve } = dialogProps;
    setDialogProps({ open: false });
    if (typeof onResolve === 'function') onResolve(true);
  }, [dialogProps]);

  const handleCancel = useCallback(() => {
    const { onResolve } = dialogProps;
    setDialogProps({ open: false });
    if (typeof onResolve === 'function') onResolve(false);
  }, [dialogProps]);

  return { dialogProps, confirm, handleConfirm, handleCancel };
}