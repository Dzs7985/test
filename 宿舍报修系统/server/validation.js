/** 账号与密码的通用校验：用户名、密码只允许字母与数字（前后端一致的唯一规则来源）。 */
export const isAlnum = (value) => typeof value === 'string' && /^[A-Za-z0-9]+$/.test(value);