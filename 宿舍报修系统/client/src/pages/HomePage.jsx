import { NavLink } from 'react-router-dom';

export default function HomePage() {
  return (
    <div className="page home-page">
      <div className="hero">
        <div>
          <h1>快速提交报修，方便管理处理</h1>
          <p>学生可在线提交故障，提升维修效率。</p>
        </div>
      </div>

      <div className="role-grid">
        <NavLink to="/student" className="role-card">
          <span className="role-label">学生入口</span>
          <strong>报修申请</strong>
          <small>选择报修类型、填写位置并上传照片</small>
        </NavLink>

        <NavLink to="/dorm-manager" className="role-card alt">
          <span className="role-label">管理入口</span>
          <strong>工单管理</strong>
          <small>查看全部报修、标记已处理、删除异常记录</small>
        </NavLink>
      </div>
    </div>
  );
}