import { useState } from 'react';
import { formatDateTime, normalizeRepairStatus, REPAIR_STATUS_CLASS } from '../../lib/constants';
import { formatRepairLocation } from '../../lib/locationOptions';
import { DORM_MODULE_ID, findModule, moduleIdOf } from '../../lib/modules';

/**
 * 工单看板：管理员与宿管共用。
 * 删除权限不在这里判断，直接沿用 repairs.canDelete（唯一来源，默认拒绝），
 * 避免界面与操作各判一次、出现「按钮可见但点击被拦」或反之。
 * records：管理员传入筛选后的列表；toolbar：标题下方的筛选栏等附加内容；
 * config：管理员传入（用于显示非宿舍模块的名称），宿管视图不传。
 * 状态流转：未完成 →（标记完成）→ 已完成（历史「维修中」统一显示为未完成）
 */
export default function RepairsBoard({
  repairs,
  title = '',
  records,
  emptyText = '暂无报修工单',
  toolbar = null,
  config = null,
}) {
  const { records: allRecords, loading, finishRepair, removeRepair, canDelete } = repairs;
  // 标记完成时弹出的说明输入框：{ id, text }；说明会同步给学生自查页面
  const [handling, setHandling] = useState(null);
  const list = records || allRecords;

  const submitHandled = async () => {
    if (!handling) return;
    await finishRepair(handling.id, handling.text);
    setHandling(null);
  };

  return (
    <div>
      {title ? <h3 style={{ marginTop: 28 }}>{title}</h3> : null}
      {toolbar}

      {loading ? <p className="empty">加载中…</p> : null}
      {!loading && list.length === 0 ? <p className="empty">{emptyText}</p> : null}

      <div className="record-list">
        {list.map((item) => {
          // 按记录里的地点字段展示：食堂/层号、楼号/实验室、具体地点或楼号/房间号（宿舍视图不依赖 config）
          const location = formatRepairLocation(item);
          // 宿舍模块不显示模块行（避免噪音）；模块被删除后历史工单仍可辨认
          const moduleId = moduleIdOf(item);
          const moduleName = moduleId === DORM_MODULE_ID ? '' : findModule(config, moduleId)?.name || '已删除的模块';
          const status = normalizeRepairStatus(item.status);
          const done = status === '已完成';
          const followUps = Array.isArray(item.followUps) ? item.followUps : [];

          return (
            <article key={item.id} className="record-card">
              <div className="record-head">
                {/* 姓名为空时不显示占位文案（非宿舍模块不收集姓名），只保留右侧状态 */}
                <span>{item.name || ''}</span>
                <span className={`status ${REPAIR_STATUS_CLASS[status] || 'pending'}`}>{status}</span>
              </div>

              {moduleName ? <p>报修模块：{moduleName}</p> : null}
              <p>位置：{location || '—'}</p>
              <p>故障类型：{item.category || '—'}</p>
              <p>问题描述：{item.description || '—'}</p>
              <p>联系方式：{item.contact || '—'}</p>
              <p>提交时间：{formatDateTime(item.createdAt)}</p>
              {item.feedback ? <p>处理说明：{item.feedback}</p> : null}

              {followUps.length ? (
                <div className="follow-ups">
                  <p className="follow-ups-title">学生反馈（{followUps.length} 条）</p>
                  {followUps.map((feedback) => (
                    <p key={feedback.id} className="follow-up-item">
                      <span className="follow-up-kind">{feedback.kind === 'urge' ? '催办' : '仍未解决'}</span>
                      {feedback.text}
                      <small>（{formatDateTime(feedback.at)}）</small>
                    </p>
                  ))}
                </div>
              ) : null}

              {item.image ? <img className="repair-image" src={item.image} alt="报修照片" /> : null}

              <div className="manager-actions">
                {done ? null : (
                  <button type="button" onClick={() => setHandling({ id: item.id, text: '' })}>
                    标记完成
                  </button>
                )}
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

      {handling ? (
        <div className="confirm-overlay" onClick={() => setHandling(null)} role="dialog" aria-modal="true">
          <div className="confirm-dialog" onClick={(event) => event.stopPropagation()}>
            <div className="confirm-title">标记完成</div>
            <p className="confirm-message">填写处理说明后，学生在自查页面可以看到状态与说明（可留空）。</p>
            <textarea
              className="handle-feedback"
              rows="3"
              maxLength={300}
              value={handling.text}
              placeholder="例：已更换损坏的灯管，如仍有问题可再次反馈"
              onChange={(event) => setHandling({ ...handling, text: event.target.value })}
            />
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={() => setHandling(null)}>
                取消
              </button>
              <button type="button" className="confirm-ok" onClick={submitHandled}>
                确认完成
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}