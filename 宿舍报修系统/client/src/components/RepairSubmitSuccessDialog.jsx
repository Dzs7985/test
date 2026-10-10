import { useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * 报修提交成功弹窗：高亮展示查询码，引导学生保存并去「查询进度」页自查。
 * 学生端没有账号，查询码或提交时填写的手机号是查询进度的凭据，因此用弹窗单独突出展示。
 */
export default function RepairSubmitSuccessDialog({ code, onClose }) {
  const [tip, setTip] = useState('');

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code || '');
      setTip('查询码已复制到剪贴板');
    } catch {
      setTip('复制失败，请手动抄写查询码');
    }
  };

  return (
    <div className="confirm-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="confirm-dialog submit-success-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="confirm-title">报修提交成功</div>
        <div className="confirm-message">
          工单已进入待处理列表。查询码请保存，可凭它在「查询进度」页查看处理状态与管理员反馈。
        </div>
        <div className="submit-code-row">
          <span className="submit-code-label">查询码</span>
          <strong className="query-code">{code}</strong>
          <button type="button" className="submit-code-copy" onClick={copyCode}>
            复制
          </button>
        </div>
        {tip ? <p className="submit-code-tip">{tip}</p> : null}
        <div className="confirm-actions">
          <button type="button" className="confirm-cancel" onClick={onClose}>
            关闭
          </button>
          <Link className="confirm-ok submit-dialog-link" to="/student/query" onClick={onClose}>
            去查询进度
          </Link>
        </div>
      </div>
    </div>
  );
}