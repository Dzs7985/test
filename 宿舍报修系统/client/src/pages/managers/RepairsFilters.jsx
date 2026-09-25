/** 时间范围选项：按提交时间过滤 */
import { normalizeRepairStatus } from '../../lib/constants';

const TIME_OPTIONS = [
  { value: 'all', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: 'week', label: '近 7 天' },
  { value: 'month', label: '近 30 天' },
];

/** 各时间范围覆盖的天数（含今天） */
const RANGE_DAYS = { today: 1, week: 7, month: 30 };

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'pending', label: '未完成' },
  { value: 'doing', label: '维修中' },
  { value: 'done', label: '已完成' },
];

const STATUS_LABEL = { pending: '未完成', doing: '维修中', done: '已完成' };

export const emptyRepairFilters = { campus: '', building: '', time: 'all', status: 'all' };

export const hasActiveFilters = (filters) =>
  Boolean(filters.campus || filters.building) || filters.time !== 'all' || filters.status !== 'all';

/** 校区/楼号被改名或删除后，筛选里残留的旧值回落到「全部」，避免下拉空白却仍在按旧值过滤 */
export const normalizeFilters = (filters, config) => {
  const campuses = config?.campuses || [];
  const campus = campuses.includes(filters.campus) ? filters.campus : '';
  const buildings = campus ? config?.campusBuildings?.[campus] || [] : [];
  const building = buildings.includes(filters.building) ? filters.building : '';
  if (campus === filters.campus && building === filters.building) return filters;
  return { ...filters, campus, building };
};

/** 时间范围起点（当天 0 点往前推），不限时返回 0 */
const rangeStart = (key) => {
  const days = RANGE_DAYS[key];
  if (!days) return 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  return start.getTime();
};

/** 按校区、楼号、时间范围、处理状态过滤工单；宿管视图已被后端限定到自己的校区楼号，无需筛选 */
export const applyRepairFilters = (records, filters) => {
  const from = rangeStart(filters.time);
  return records.filter((item) => {
    if (filters.campus && item.campus !== filters.campus) return false;
    if (filters.building && item.building !== filters.building) return false;
    const status = normalizeRepairStatus(item.status);
    if (filters.status !== 'all' && status !== STATUS_LABEL[filters.status]) {
      return false;
    }
    if (from) {
      const created = new Date(item.createdAt).getTime();
      if (!(created >= from)) return false;
    }
    return true;
  });
};

/**
 * 管理员工单筛选栏：按校区 / 楼号 / 时间 / 状态区分工单。
 * 校区与楼号选项取自「校区和楼号设置」的配置，改配置后这里同步变化；
 * 楼号必须先选校区（与报修表单一致），否则无法确定楼号属于哪个校区。
 */
export default function RepairsFilters({ records, config, filters, onChange, matched }) {
  const campuses = config?.campuses || [];
  const buildings = filters.campus ? config?.campusBuildings?.[filters.campus] || [] : [];

  const change = (key, value) => onChange({ ...filters, [key]: value });
  // 换了校区后原来的楼号多半不属于该校区，直接回到「全部楼号」
  const changeCampus = (campus) => onChange({ ...filters, campus, building: '' });

  return (
    <div className="filter-bar">
      <label className="filter-field">
        校区
        <select value={filters.campus} onChange={(event) => changeCampus(event.target.value)}>
          <option value="">全部校区</option>
          {campuses.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        楼号
        <select
          value={filters.building}
          disabled={!filters.campus}
          onChange={(event) => change('building', event.target.value)}
        >
          <option value="">{filters.campus ? '全部楼号' : '请先选择校区'}</option>
          {buildings.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        时间
        <select value={filters.time} onChange={(event) => change('time', event.target.value)}>
          {TIME_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        状态
        <select value={filters.status} onChange={(event) => change('status', event.target.value)}>
          {STATUS_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <div className="filter-actions">
        <span className="filter-summary">
          显示 {matched} / {records.length} 条
        </span>
        {hasActiveFilters(filters) ? (
          <button type="button" className="mini-action" onClick={() => onChange(emptyRepairFilters)}>
            重置
          </button>
        ) : null}
      </div>
    </div>
  );
}