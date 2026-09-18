import { NavLink, useLocation } from 'react-router-dom';

export default function Header() {
  const location = useLocation();
  const showReturn = location && location.pathname !== '/';

  return (
    <header className="topbar">
      {showReturn ? (
        <NavLink to="/" className="topbar-return" aria-label="返回首页">
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
        </NavLink>
      ) : null}
      <div className="brand">宿舍报修系统</div>
    </header>
  );
}