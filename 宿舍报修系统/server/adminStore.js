import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, 'data', 'admin.json');

/**
 * 管理员密码存盘：管理员可以在后台改自己的密码，改完重启服务依然生效。
 * 没存过盘时返回空串，由调用方回退到初始密码（环境变量 ADMIN_PASS 或默认值）。
 */
export const readAdminPassword = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof parsed?.password === 'string' ? parsed.password : '';
  } catch {
    return '';
  }
};

export const writeAdminPassword = (password) => {
  fs.writeFileSync(file, JSON.stringify({ password }, null, 2), 'utf8');
};