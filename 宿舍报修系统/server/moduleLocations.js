/**
 * 各报修模块「具体地点」的选项配置（管理员在「模块管理 → 地点设置」里维护）。
 * 存在 config.json 的 moduleLocations 键：
 *   lab:       { campusBuildings: { 校区: [楼号…] }, campusLabs: { 校区: { 楼号: [实验室名称…] } } }
 *   canteen:   { campusCanteens: { 校区: [食堂…] }, campusFloors: { 校区: [层号…] } }
 *   classroom: { campusBuildings: { 校区: [楼号…] }, campusRooms: { 校区: { 楼号: [房间号…] } } }
 *   office:    { campusBuildings: { 校区: [楼号…] }, campusRooms: { 校区: { 楼号: [房间号…] } } }
 *   <自定义模块>: { campusFloors: { 校区: [楼层…] } }
 * 楼号 / 食堂 / 层号 / 楼层按校区维护；实验室名称、房间号再按「校区 → 楼号」细分，互不影响。
 * 自定义模块（如图书馆报修）的学生表单先选楼层、再填具体地点；楼层缺键时为空，学生端回退为自行填写。
 */

/** 整个键缺失时的默认选项；空数组表示管理员清空过，保持为空 */
export const DEFAULT_LAB_NAMES = ['物理实验室', '化学实验室', '生物实验室', '计算机实验室'];
export const DEFAULT_FLOORS = ['1层', '2层', '3层', '4层', '5层', '6层'];
export const DEFAULT_CANTEENS = ['第一食堂', '第二食堂'];

/** 按「校区」维护的列表字段；再按「楼号」细分的字段（值为 校区 → 楼号 → 列表） */
const CAMPUS_LIST_FIELDS = ['campusBuildings', 'campusCanteens', 'campusFloors'];
const CAMPUS_NESTED_FIELDS = ['campusLabs', 'campusRooms'];

const asObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

/** 字符串数组去空白、去重；非数组返回 null（表示缺键，交由默认值兜底） */
const cleanList = (value) => {
  if (!Array.isArray(value)) return null;
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
};

/** 按校区维护的列表：保证每个校区都有键；某校区缺列表时用 fallbackOf(campus) 兜底 */
const cleanCampusMap = (raw, campuses, fallbackOf) => {
  const map = asObject(raw);
  const next = {};
  campuses.forEach((campus) => {
    next[campus] = cleanList(map[campus]) || fallbackOf(campus);
  });
  return next;
};

/**
 * 按「校区 → 楼号」维护的列表：一层键为校区，二层键为该模块在当前校区的楼号列表
 * （楼号改名/删除后对应的细分选项一并丢弃，与校区改名的处理一致）。
 */
const cleanBuildingMap = (raw, campuses, buildingsOf, fallbackOf) => {
  const map = asObject(raw);
  const next = {};
  campuses.forEach((campus) => {
    const perCampus = asObject(map[campus]);
    const inner = {};
    buildingsOf(campus).forEach((building) => {
      inner[building] = cleanList(perCampus[building]) || fallbackOf(campus, building);
    });
    next[campus] = inner;
  });
  return next;
};

/** 读盘与写盘统一的规范化：内置模块的四个键 + 各自定义模块的楼层键，形状固定，缺键补默认值 */
export const normalizeModuleLocations = (raw, campuses, campusBuildings, modules) => {
  const source = asObject(raw);
  const dormBuildingsOf = (campus) => campusBuildings?.[campus] || [];
  const lab = asObject(source.lab);
  const canteen = asObject(source.canteen);
  const classroom = asObject(source.classroom);
  const office = asObject(source.office);

  // 实验室名称的旧数据：全校统一的 labs，其次按校区的数组形态 campusLabs
  const legacyLabs = cleanList(lab.labs) || null;
  const legacyCampusLabs = asObject(lab.campusLabs);
  const legacyLabsOf = (campus) =>
    legacyLabs || cleanList(legacyCampusLabs[campus]) || [...DEFAULT_LAB_NAMES];

  // 其他模块的楼号默认与本校区的宿舍楼号一致（同属学校楼栋编号），管理员可再单独调整
  const labBuildings = cleanCampusMap(lab.campusBuildings, campuses, dormBuildingsOf);
  const classroomBuildings = cleanCampusMap(classroom.campusBuildings, campuses, dormBuildingsOf);
  const officeBuildings = cleanCampusMap(office.campusBuildings, campuses, dormBuildingsOf);

  // 自定义模块（如「图书馆报修」）：只有按校区维护的楼层；缺键为空数组（学生端回退为自行填写）
  const customLocations = {};
  (modules || []).forEach((item) => {
    if (item.locationMode !== 'custom') return;
    customLocations[item.id] = {
      campusFloors: cleanCampusMap(asObject(source[item.id]).campusFloors, campuses, () => []),
    };
  });

  return {
    lab: {
      campusBuildings: labBuildings,
      // 实验室名称按「校区 → 楼号」细分；旧数据（全校统一或按校区）作为各楼号的初始值
      campusLabs: cleanBuildingMap(lab.campusLabs, campuses, (campus) => labBuildings[campus], legacyLabsOf),
    },
    canteen: {
      campusCanteens: cleanCampusMap(canteen.campusCanteens, campuses, () => [...DEFAULT_CANTEENS]),
      // 层号按校区维护；旧配置里全校统一的 floors 作为各校区初始值
      campusFloors: cleanCampusMap(
        canteen.campusFloors,
        campuses,
        () => cleanList(canteen.floors) || [...DEFAULT_FLOORS],
      ),
    },
    classroom: {
      campusBuildings: classroomBuildings,
      // 房间号按「校区 → 楼号」细分；无历史数据，缺键时为空（学生端回退为自行填写）
      campusRooms: cleanBuildingMap(classroom.campusRooms, campuses, (campus) => classroomBuildings[campus], () => []),
    },
    office: {
      campusBuildings: officeBuildings,
      campusRooms: cleanBuildingMap(office.campusRooms, campuses, (campus) => officeBuildings[campus], () => []),
    },
    ...customLocations,
  };
};

const isStringList = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isValidCampusMap = (value) => value === undefined || (isPlainObject(value) && Object.values(value).every(isStringList));
/** 校区 → 楼号 → 列表：每个校区的值必须是对象，且其每个值都是字符串数组 */
const isValidBuildingMap = (value) =>
  value === undefined ||
  (isPlainObject(value) && Object.values(value).every((inner) => isPlainObject(inner) && Object.values(inner).every(isStringList)));

/** 写盘前校验：必须是对象；出现的每个列表（含按校区、按楼号的下层键）都必须是字符串数组，缺键允许 */
export const validateModuleLocations = (raw) => {
  if (!isPlainObject(raw)) return { error: '模块地点配置格式不正确' };
  const valid = Object.values(raw).every(
    (item) =>
      isPlainObject(item) &&
      CAMPUS_LIST_FIELDS.every((field) => isValidCampusMap(item[field])) &&
      CAMPUS_NESTED_FIELDS.every((field) => isValidBuildingMap(item[field])),
  );
  if (!valid) return { error: '模块地点配置格式不正确' };
  return { moduleLocations: raw };
};

/** 校区改名后同步迁移各模块地点配置里的校区键（否则会按新校区列表规范化时被丢弃） */
export const renameCampusInLocations = (moduleLocations, from, to) => {
  const move = (map) => {
    if (!map || !(from in map)) return map;
    const next = { ...map };
    next[to] = next[from];
    delete next[from];
    return next;
  };

  return Object.fromEntries(
    Object.entries(asObject(moduleLocations)).map(([id, location]) => {
      const next = { ...asObject(location) };
      [...CAMPUS_LIST_FIELDS, ...CAMPUS_NESTED_FIELDS].forEach((field) => {
        if (next[field]) next[field] = move(next[field]);
      });
      return [id, next];
    }),
  );
};