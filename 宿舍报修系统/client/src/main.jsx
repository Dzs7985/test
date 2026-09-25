import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// 样式按「基础 → 各页面 → 响应式」顺序加载，顺序会影响同名选择器的覆盖关系
import './styles/base.css';
import './styles/home.css';
import './styles/admin.css';
import './styles/repairs.css';
import './styles/student.css';
import './styles/login.css';
import './styles/stats.css';
import './styles/responsive.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
