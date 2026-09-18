/**
 * 固定在视口顶部的操作反馈条。
 * 之前的提示渲染在页面底部，操作失败时用户看不到，误以为按钮无响应。
 */
export default function StatusToast({ notice, onClose }) {
  if (!notice) return null;

  return (
    <div className={`status-toast ${notice.tone === 'error' ? 'is-error' : 'is-success'}`} role="status">
      <span>{notice.text}</span>
      <button type="button" className="status-toast-close" onClick={onClose} aria-label="关闭提示">
        ×
      </button>
    </div>
  );
}