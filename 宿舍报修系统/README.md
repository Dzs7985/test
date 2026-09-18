# 宿舍报修系统

基于 React + Vite + Tailwind CSS（前端）与 Node.js + Express + lowdb（后端）的宿舍报修网页应用。

## 快速启动

```bash
# 安装全部依赖
npm run install:all

# 同时启动前后端
npm run dev
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3001
- 图片访问：http://localhost:3001/uploads/文件名

## 分别启动

```bash
# 终端 1 - 后端
cd server && npm install && npm run dev

# 终端 2 - 前端
cd client && npm install && npm run dev
```

## 功能概览

| 路由 | 说明 |
|------|------|
| `/` | 角色选择首页（学生 / 宿管） |
| `/student` | 学生提交报修 |
| `/dorm-manager` | 宿管查看全部报修、标记已处理、删除 |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/repairs` | 提交报修（multipart/form-data） |
| GET | `/api/repairs` | 获取全部报修（时间倒序，需管理员令牌） |
| PATCH | `/api/repairs/:id` | 标记为已处理 |
| DELETE | `/api/repairs/:id` | 删除记录及图片 |

## 目录结构

```
├── client/          # React 前端
├── server/          # Express 后端
│   ├── data/        # lowdb JSON 数据
│   └── uploads/     # 上传图片
└── package.json     # 根脚本（concurrently）
```
