import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, 'data', 'student.json');

/** 初始学生账号：仅在还没有存盘账号时使用，学生改密后以 data/student.json 为准 */
export const INITIAL_STUDENT_USERNAME = process.env.STUDENT_USER || '123456';
export const INITIAL_STUDENT_PASSWORD = process.env.STUDENT_PASS || '123456';

/**
 * 学生账号存盘：学生可以在报修页修改自己的密码，改完重启服务依然生效。
 * 没存过盘时返回 null，由调用方回退到初始账号 123456 / 123456。
 */
export const readStudentAccount = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof parsed?.username === 'string' && typeof parsed?.password === 'string') {
      return { username: parsed.username, password: parsed.password };
    }
    return null;
  } catch {
    return null;
  }
};

export const writeStudentPassword = (password) => {
  const current = readStudentAccount() || { username: INITIAL_STUDENT_USERNAME };
  fs.writeFileSync(file, JSON.stringify({ username: current.username, password }, null, 2), 'utf8');
};
