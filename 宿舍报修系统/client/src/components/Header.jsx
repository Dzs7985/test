import { useLocation, useNavigate } from 'react-router-dom';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const showReturn = location && location.pathname !== '/';

  // 返回上一页；直接打开站内链接（首条记录没有上一页）时回首页兜底，避免跳出站点
  const goBack = () => {
    if (location.key === 'default') {
      navigate('/');
      return;
    }
    navigate(-1);
  };

  return (
    <header className="topbar">
      {showReturn ? (
        <button type="button" className="topbar-return" aria-label="返回" onClick={goBack}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      ) : null}
      <div className="brand">报修系统</div>
    </header>
  );
}