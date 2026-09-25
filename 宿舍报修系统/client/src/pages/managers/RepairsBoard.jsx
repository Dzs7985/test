import { formatDateTime, normalizeRepairStatus } from '../../lib/constants';

/** 状态徽章样式：未完成(pending 琥珀)、维修中(doing 蓝色)、已完成(done 绿色) */
const STATUS_CLASS = {
  未完成: 'pending',
  维修中: 'doing',
  已完成: 'done',
};

/**
 * 工单看板：管理员与宿管共用。
 * canDelete 默认关闭（权限默认拒绝），只有明确传 true 的管理员视图才出现删除入口。
 * records：管理员传入筛选后的列表；toolbar：标题下方的筛选栏等附加内容。
 * 状态流转：未完成 →（开始维修）→ 维修中 →（标记完成）→ 已完成
 */
export default function RepairsBoard({
  repairs,
  canDelete = false,
  title = '报修工单管理',
  records,
  emptyText = '暂无报修工单',
  toolbar = null,
}) {
  const { records: allRecords, loading, startRepair, finishRepair, removeRepair } = repairs;
  const list = records || allRecords;

  return (
    <div>
      <h3 style={{ marginTop: 28 }}>{title}</h3>
      {toolbar}

      {loading ? <p className="empty">加载中…</p> : null}
      {!loading && list.length === 0 ? <p className="empty">{emptyText}</p> : null}

      <div className="record-list">
        {list.map((item) => {
          const location = [item.campus, item.building, item.roomNumber].filter(Boolean).join(' / ');
          const status = normalizeRepairStatus(item.status);
          const done = status === '已完成';
          const doing = status === '维修中';

          return (
            <article key={item.id} className="record-card">
              <div className="record-head">
                <span>{item.name || '未填写姓名'}</span>
                <span className={`status ${STATUS_CLASS[status] || 'pending'}`}>{status}</span>
              </div>

              <p>位置：{location || '—'}</p>
              <p>故障类型：{item.category || '—'}</p>
              <p>问题描述：{item.description || '—'}</p>
              <p>联系方式：{item.contact || '—'}</p>
              <p>提交时间：{formatDateTime(item.createdAt)}</p>

              {item.image ? <img className="repair-image" src={item.image} alt="报修照片" /> : null}

              <div className="manager-actions">
                {status === '未完成' ? (
                  <button type="button" onClick={() => startRepair(item.id)}>
                    开始维修
                  </button>
                ) : null}
                {!done ? (
                  <button type="button" onClick={() => finishRepair(item.id)}>
                    {doing ? '标记完成' : '直接完成'}
                  </button>
                ) : null}
                {canDelete ? (
                  <button type="button" className="danger" onClick={() => removeRepair(item.id)}>
                    删除
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
