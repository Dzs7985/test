import { useMemo } from 'react';
import { normalizeRepairStatus, repairCategories } from '../../lib/constants';

/** 各类故障在环形图 / 图例中的固定配色：蓝色系为主，个别暖色仅用于区分 */
const CATEGORY_COLORS = {
  水电: '#1d4ed8',
  网络: '#0ea5e9',
  门窗: '#6366f1',
  空调: '#0d9488',
  家具: '#f59e0b',
  其他: '#94a3b8',
};

const FALLBACK_CATEGORY = '其他';

/** 判断工单创建时间是否在指定「年月」内（本地时区） */
const inMonth = (date, year, month) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() === month;
};

/** 百分比格式化：整数不带小数，不足 10% 保留一位小数，避免小份额全显示成 0% */
const fmtPct = (value) => {
  if (value >= 10) return `${Math.round(value)}%`;
  return `${Math.round(value * 10) / 10}%`;
};

/**
 * 环形进度：SVG 圆描边做底环 + 比例弧。
 * 用 stroke-dasharray/offset 切弧；旋转 -90° 让起点在正上方。
 */
function Ring({ value, size = 120, stroke = 12, color = '#2563eb', track = '#dbeafe', children }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, value));
  const arc = clamped * circumference;

  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${circumference - arc}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/**
 * 管理员数据统计看板：
 * - 本月维修数量 / 已完成 / 待处理 / 完成率 四个指标卡
 * - 本月各类故障占比环形图 + 图例
 * - 全部工单累计完成率（附加参考）
 * 数据源就是工单管理同一份 records（5 秒轮询），看板无需单独请求。
 */
export default function StatsBoard({ records = [], loading = false }) {
  const stats = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthRecords = records.filter((item) => inMonth(item.createdAt, year, month));

    const total = monthRecords.length;
    const done = monthRecords.filter((item) => normalizeRepairStatus(item.status) === '已完成').length;
    const doing = monthRecords.filter((item) => normalizeRepairStatus(item.status) === '维修中').length;
    const pending = total - done - doing;
    const rate = total ? done / total : 0;

    // 各类故障数量：枚举驱动，保证类别全集稳定；未填 / 未知类别归入「其他」
    const countByCategory = new Map(repairCategories.map((name) => [name, 0]));
    monthRecords.forEach((item) => {
      const key = countByCategory.has(item.category) ? item.category : FALLBACK_CATEGORY;
      countByCategory.set(key, (countByCategory.get(key) || 0) + 1);
    });
    const segments = repairCategories
      .map((name) => ({ name, count: countByCategory.get(name) || 0 }))
      .filter((seg) => seg.count > 0)
      .sort((a, b) => b.count - a.count);

    // 累计（全部工单）完成率，作为本月之外的参考
    const allDone = records.filter((item) => normalizeRepairStatus(item.status) === '已完成').length;
    const allRate = records.length ? allDone / records.length : 0;

    return {
      year,
      month,
      total,
      done,
      doing,
      pending,
      rate,
      segments,
      allDone,
      allTotal: records.length,
      allRate,
    };
  }, [records]);

  const monthLabel = `${stats.year} 年 ${stats.month + 1} 月`;

  // 环形图分段参数
  const donutSize = 190;
  const donutStroke = 30;
  const radius = (donutSize - donutStroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let cursor = 0;

  return (
    <div className="stats-board">
      <div className="stats-head">
        <h2 className="stats-title">数据统计看板</h2>
        <span className="stats-month">统计周期：{monthLabel}（本月）</span>
      </div>

      {loading ? (
        <p className="stats-empty">数据加载中…</p>
      ) : (
        <>
          {/* 核心指标卡 */}
          <div className="stat-cards">
            <div className="stat-card stat-card-total">
              <span className="stat-label">本月维修数量</span>
              <strong className="stat-value">{stats.total}</strong>
              <span className="stat-unit">单</span>
            </div>

            <div className="stat-card stat-card-pending">
              <span className="stat-label">未完成</span>
              <strong className="stat-value">{stats.pending}</strong>
              <span className="stat-unit">单</span>
            </div>

            <div className="stat-card stat-card-doing">
              <span className="stat-label">维修中</span>
              <strong className="stat-value">{stats.doing}</strong>
              <span className="stat-unit">单</span>
            </div>

            <div className="stat-card stat-card-done">
              <span className="stat-label">已完成</span>
              <strong className="stat-value">{stats.done}</strong>
              <span className="stat-unit">单</span>
            </div>

            <div className="stat-card stat-card-rate">
              <Ring value={stats.rate} size={86} stroke={10} color="#2563eb">
                <strong>{fmtPct(stats.rate * 100)}</strong>
              </Ring>
              <span className="stat-label">本月完成率</span>
            </div>
          </div>

          {/* 各类故障占比 */}
          <section className="panel stats-category-panel">
            <h3 className="stats-section-title">各类故障占比（本月）</h3>
            {stats.total === 0 ? (
              <p className="stats-empty">本月暂无报修工单</p>
            ) : (
              <div className="stats-category-body">
                <div className="donut-wrap">
                  <svg width={donutSize} height={donutSize} viewBox={`0 0 ${donutSize} ${donutSize}`}>
                    <circle
                      cx={donutSize / 2}
                      cy={donutSize / 2}
                      r={radius}
                      fill="none"
                      stroke="#eaf1fd"
                      strokeWidth={donutStroke}
                    />
                    {stats.segments.map((seg) => {
                      const fraction = seg.count / stats.total;
                      const arc = fraction * circumference;
                      const el = (
                        <circle
                          key={seg.name}
                          cx={donutSize / 2}
                          cy={donutSize / 2}
                          r={radius}
                          fill="none"
                          stroke={CATEGORY_COLORS[seg.name] || CATEGORY_COLORS[FALLBACK_CATEGORY]}
                          strokeWidth={donutStroke}
                          strokeDasharray={`${arc} ${circumference - arc}`}
                          strokeDashoffset={-cursor}
                          transform={`rotate(-90 ${donutSize / 2} ${donutSize / 2})`}
                        >
                          <title>{`${seg.name}：${seg.count} 单，占比 ${fmtPct(fraction * 100)}`}</title>
                        </circle>
                      );
                      cursor += arc;
                      return el;
                    })}
                  </svg>
                  <div className="donut-center">
                    <strong>{stats.total}</strong>
                    <span>本月工单</span>
                  </div>
                </div>

                <ul className="category-legend">
                  {stats.segments.map((seg) => {
                    const fraction = stats.total ? seg.count / stats.total : 0;
                    return (
                      <li key={seg.name} className="legend-row">
                        <span
                          className="legend-dot"
                          style={{ background: CATEGORY_COLORS[seg.name] || CATEGORY_COLORS[FALLBACK_CATEGORY] }}
                        />
                        <span className="legend-name">{seg.name}</span>
                        <span className="legend-bar">
                          <i style={{ width: `${fraction * 100}%`, background: CATEGORY_COLORS[seg.name] }} />
                        </span>
                        <span className="legend-count">{seg.count} 单</span>
                        <span className="legend-pct">{fmtPct(fraction * 100)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          {/* 累计完成率参考 */}
          <section className="panel stats-overall">
            <div className="overall-head">
              <h3 className="stats-section-title">全部工单累计完成率</h3>
              <span className="overall-note">
                已完成 {stats.allDone} / 共 {stats.allTotal} 单
              </span>
            </div>
            <div className="overall-track">
              <i style={{ width: `${stats.allRate * 100}%` }} />
            </div>
            <strong className="overall-pct">{fmtPct(stats.allRate * 100)}</strong>
          </section>
        </>
      )}
    </div>
  );
}
