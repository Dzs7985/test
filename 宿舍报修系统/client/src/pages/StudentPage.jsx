import { Link } from 'react-router-dom';
import { enabledModules } from '../lib/modules';

/** 学生入口：先选择报修类型（模块），再进入对应的报修表单 */
export default function StudentPage({ config }) {
  const modules = enabledModules(config);

  return (
    <div className="page">
      <section className="panel">
        <h2>选择报修类型</h2>

        {modules.length === 0 ? (
          <p className="empty">暂未开放报修模块，请联系管理员。</p>
        ) : (
          <div className="module-grid">
            {modules.map((item) => (
              <Link key={item.id} to={`/student/${item.id}`} className="module-card">
                <strong>{item.name}</strong>
                <small>
                  {item.locationMode === 'building' ? '按校区 / 楼号分派宿管处理' : '填写具体地点，由管理员处理'}
                </small>
              </Link>
            ))}
          </div>
        )}

        <div className="query-entry">
          <Link to="/student/query" className="primary-btn">
            查询报修进度
          </Link>
          <span className="module-hint">凭提交时的查询码，或提交时填写的手机号，查看处理状态与反馈</span>
        </div>
      </section>
    </div>
  );
}