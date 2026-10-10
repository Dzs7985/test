import express from 'express';

/**
 * 回收站路由（仅管理员）：查看条目、恢复、调整保留天数。
 * 条目不可手动删除：保留期内可恢复，到期后由存储层自动清理（见 trashStore.js）。
 * handlers 按条目 type 提供各自的恢复实现，返回值形如 { message } 或 { error }。
 */
export const createTrashRoutes = ({ isAdminReq, store, handlers }) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    if (!isAdminReq(req)) return res.status(403).json({ error: '仅限管理员查看' });
    return res.json(store.read());
  });

  router.patch('/', (req, res) => {
    if (!isAdminReq(req)) return res.status(403).json({ error: '仅限管理员操作' });
    const { retentionDays } = req.body || {};
    if (!Number.isFinite(Number(retentionDays))) {
      return res.status(400).json({ error: '保留天数需为数字' });
    }
    return res.json({ success: true, retentionDays: store.setRetention(retentionDays) });
  });

  router.post('/:id/restore', (req, res) => {
    if (!isAdminReq(req)) return res.status(403).json({ error: '仅限管理员操作' });
    const item = store.get(req.params.id);
    if (!item) return res.status(404).json({ error: '该条目已过期或不存在' });
    const restore = handlers[item.type];
    if (!restore) return res.status(400).json({ error: '该类型暂不支持恢复' });
    const result = restore(item);
    if (result?.error) return res.status(409).json({ error: result.error });
    store.drop(item.id);
    return res.json({ success: true, message: result?.message || '恢复成功' });
  });

  return router;
};