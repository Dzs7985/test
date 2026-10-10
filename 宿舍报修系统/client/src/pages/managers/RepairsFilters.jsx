import { campusListOf } from '../../lib/locationOptions';
import { findModule, moduleIdOf } from '../../lib/modules';

/** 时间范围选项：按提交时间过滤 */
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
  { value: 'pending', label: '待处理' },
  { value: 'done', label: '已处理' },
];

export const emptyRepairFilters = { campus: '', module: '', place: '', time: 'all', status: 'all' };

export const hasActiveFilters = (filters) =>
  Boolean(filters.campus || filters.module || filters.place) || filters.time !== 'all' || filters.status !== 'all';

/** 地点字段随模块变化：食堂模块按食堂名筛选，自定义模块按楼层筛选，其余模块按楼号筛选（与报修表单的层级一致） */
const placeFieldOf = (config, moduleId) => {
  const mode = findModule(config, moduleId)?.locationMode;
  if (mode === 'canteen') return 'canteen';
  if (mode === 'custom') return 'floor';
  return 'building';
};

/** 地点筛选的名称：选中模块后显示该模块地点的实际名称（楼号 / 食堂 / 楼层），未选模块时用通用的「地点」 */
const placeLabelOf = (config, moduleId) => {
  if (!moduleId) return '地点';
  const mode = findModule(config, moduleId)?.locationMode;
  if (mode === 'canteen') return '食堂';
  if (mode === 'custom') return '楼层';
  return '楼号';
};

/** 校区/模块/地点被改名或删除后，筛选里残留的旧值回落到「全部」，避免下拉空白却仍在按旧值过滤 */
export const normalizeFilters = (filters, config) => {
  const campuses = config?.campuses || [];
  const campus = campuses.includes(filters.campus) ? filters.campus : '';
  const modules = config?.modules || [];
  const module = modules.some((item) => item.id === filters.module) ? filters.module : '';
  const places = campus && module ? campusListOf(config, module, campus) : [];
  const place = places.includes(filters.place) ? filters.place : '';
  if (campus === filters.campus && module === filters.module && place === filters.place) return filters;
  return { ...filters, campus, module, place };
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

/** 按校区、模块、地点、时间范围、处理状态过滤工单；宿管视图已被后端限定到自己的校区楼号，无需筛选 */
export const applyRepairFilters = (records, filters, config) => {
  const from = rangeStart(filters.time);
  const placeField = filters.module && filters.place ? placeFieldOf(config, filters.module) : '';
  return records.filter((item) => {
    if (filters.campus && item.campus !== filters.campus) return false;
    // 存量工单没有 module 字段，一律按宿舍报修处理（与看板的「报修模块」显示一致）
    if (filters.module && moduleIdOf(item) !== filters.module) return false;
    if (placeField && item[placeField] !== filters.place) return false;
    if (filters.status === 'pending' && item.status === '已处理') return false;
    if (filters.status === 'done' && item.status !== '已处理') return false;
    if (from) {
      const created = new Date(item.createdAt).getTime();
      if (!(created >= from)) return false;
    }
    return true;
  });
};

/**
 * 管理员工单筛选栏：按校区 / 模块 / 地点 / 时间 / 状态区分工单。
 * 模块决定下一级「地点」的名称与选项：宿舍/实验室/教室/办公室 → 楼号，食堂 → 食堂名，
 * 自定义模块 → 楼层；选项来源与报修表单一致（按所选校区维护）；
 * 校区与模块都选定后「地点」才能选择（与报修表单「先选上一级」的规则一致）。
 */
export default function RepairsFilters({ records, config, filters, onChange, matched }) {
  const campuses = config?.campuses || [];
  const modules = config?.modules || [];

  const change = (key, value) => onChange({ ...filters, [key]: value });
  // 换了校区或模块后，原地点不再保证存在，直接回到「全部地点」
  const changeCampus = (campus) => onChange({ ...filters, campus, place: '' });
  const changeModule = (module) => onChange({ ...filters, module, place: '' });

  const placeOptions = filters.campus && filters.module ? campusListOf(config, filters.module, filters.campus) : [];
  const placeDisabled = !filters.module || !filters.campus || placeOptions.length === 0;
  const placePlaceholder = !filters.module
    ? '请先选择模块'
    : !filters.campus
      ? '请先选择校区'
      : placeOptions.length === 0
        ? `该模块暂无${placeLabelOf(config, filters.module)}选项`
        : `全部${placeLabelOf(config, filters.module)}`;

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
        模块
        <select value={filters.module} onChange={(event) => changeModule(event.target.value)}>
          <option value="">全部模块</option>
          {modules.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        {placeLabelOf(config, filters.module)}
        <select value={filters.place} disabled={placeDisabled} onChange={(event) => change('place', event.target.value)}>
          <option value="">{placePlaceholder}</option>
          {placeOptions.map((item) => (
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