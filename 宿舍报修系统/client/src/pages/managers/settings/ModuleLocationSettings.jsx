import { useState } from 'react';
import { DORM_MODULE_ID } from '../../../lib/modules';
import BuildingSettings from './BuildingSettings';
import EmergencyPhoneSettings from './EmergencyPhoneSettings';
import OptionListEditor from './OptionListEditor';

/**
 * 生成某个选项列表的增删改处理器：查重、删除二次确认后统一通过 save 提交保存。
 * label 用于提示与确认框文案（如「楼号」「实验室名称」）。
 */
const createListHandlers = ({ label, items, save, notify, confirm }) => ({
  onAdd: async (names) => {
    const added = names.filter((name) => !items.includes(name));
    if (!added.length) {
      notify(`“${names.join('、')}”已存在`, 'error');
      return false;
    }
    return save([...items, ...added], '已保存');
  },
  onRemove: async (name) => {
    const ok = await confirm(`删除后该选项会移入回收站，可在保留期内恢复。是否确认删除${label} “${name}”？`, {
      title: `删除${label}`,
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return false;
    return save(items.filter((item) => item !== name), `${label}删除成功`);
  },
  onRename: async (oldName, nextName) => {
    const value = (nextName || '').trim();
    if (!value || value === oldName) return false;
    if (items.includes(value)) {
      notify(`${label}已存在`, 'error');
      return false;
    }
    return save(items.map((item) => (item === oldName ? value : item)), `${label}修改成功`);
  },
});

/**
 * 「先选楼号、再维护该楼号下选项」的编辑块（实验室名称、房间号按楼号细分，各楼号互不影响）。
 * 楼号列表变化（切换校区、改名、删除）后，选中项自动回落到仍然存在的楼号。
 */
const BuildingScopedEditor = ({ title, label, buildings, listOf, save, notify, confirm, placeholder, emptyText }) => {
  const [picked, setPicked] = useState('');
  const building = buildings.includes(picked) ? picked : buildings[0] || '';
  const items = listOf(building);

  return (
    <OptionListEditor
      title={title}
      items={items}
      placeholder={placeholder}
      emptyText={emptyText}
      header={
        buildings.length ? (
          <div className="scope-picker">
            {buildings.map((item) => (
              <button
                key={item}
                type="button"
                className={`scope-chip${item === building ? ' is-active' : ''}`}
                onClick={() => setPicked(item)}
              >
                {item}
              </button>
            ))}
          </div>
        ) : (
          <p className="module-hint">请先在「楼号设置」里添加楼号，再维护{label}。</p>
        )
      }
      {...createListHandlers({ label, items, save: (next, text) => save(building, next, text), notify, confirm })}
    />
  );
};

/**
 * 「模块管理」右侧选中模块的专属配置：
 * 宿舍报修 → 楼号与宿管账号 + 紧急联系电话（都只与宿舍/宿管相关）；
 * 实验室 → 楼号 + 各楼号的实验室名称；食堂 → 食堂 + 层号；
 * 教室/办公室 → 楼号 + 各楼号的房间号（未配置的楼号由学生自行填写）；
 * 自定义模块（如图书馆报修）→ 楼层（未配置时学生自行填写）。
 * 楼号 / 食堂 / 层号 / 楼层按当前校区维护；实验室名称、房间号再按楼号细分，增删改一次提交整份配置。
 */
export default function ModuleLocationSettings({ module, campus, buildingAccounts, session }) {
  if (module.id === DORM_MODULE_ID) {
    return (
      <>
        <BuildingSettings campus={campus} buildingAccounts={buildingAccounts} />
        <EmergencyPhoneSettings campus={campus} />
      </>
    );
  }

  const { selectedCampus, moduleLocations, updateModuleLocation } = campus;
  const { notify, confirm } = session;
  const location = moduleLocations[module.id] || {};
  const buildingItems = (location.campusBuildings || {})[selectedCampus] || [];
  const canteenItems = (location.campusCanteens || {})[selectedCampus] || [];
  const floorItems = (location.campusFloors || {})[selectedCampus] || [];

  /** 该校区某个楼号下的细分选项（实验室名称 / 房间号） */
  const scopedItemsOf = (field, building) => ((location[field] || {})[selectedCampus] || {})[building] || [];

  /** 更新某个「按校区维护」的列表（楼号 / 食堂 / 层号） */
  const saveCampusList = (field, nextList, successText) =>
    updateModuleLocation(
      module.id,
      (current) => ({
        ...current,
        [field]: { ...(current[field] || {}), [selectedCampus]: nextList },
      }),
      successText,
    );

  /** 更新某个「按校区 → 楼号维护」的列表（实验室名称 / 房间号） */
  const saveBuildingList = (field, building, nextList, successText) =>
    updateModuleLocation(
      module.id,
      (current) => {
        const perField = current[field] || {};
        const perCampus = perField[selectedCampus] || {};
        return {
          ...current,
          [field]: { ...perField, [selectedCampus]: { ...perCampus, [building]: nextList } },
        };
      },
      successText,
    );

  const buildingEditor = (
    <OptionListEditor
      title={`楼号设置（${selectedCampus}）`}
      items={buildingItems}
      placeholder="新增楼号，例：3号楼"
      emptyText="暂无楼号"
      {...createListHandlers({
        label: '楼号',
        items: buildingItems,
        save: (next, text) => saveCampusList('campusBuildings', next, text),
        notify,
        confirm,
      })}
    />
  );

  if (module.id === 'lab') {
    return (
      <>
        {buildingEditor}
        <BuildingScopedEditor
          title={`实验室名称设置（${selectedCampus}）`}
          label="实验室名称"
          buildings={buildingItems}
          listOf={(building) => scopedItemsOf('campusLabs', building)}
          save={(building, next, text) => saveBuildingList('campusLabs', building, next, text)}
          notify={notify}
          confirm={confirm}
          placeholder="新增实验室名称，例：物理实验室"
          emptyText="该楼号暂无实验室名称"
        />
      </>
    );
  }

  if (module.id === 'canteen') {
    return (
      <>
        <OptionListEditor
          title={`食堂设置（${selectedCampus}）`}
          items={canteenItems}
          placeholder="新增食堂名称，例：第一食堂"
          emptyText="暂无食堂"
          {...createListHandlers({
            label: '食堂',
            items: canteenItems,
            save: (next, text) => saveCampusList('campusCanteens', next, text),
            notify,
            confirm,
          })}
        />
        <OptionListEditor
          title={`层号设置（${selectedCampus}）`}
          items={floorItems}
          placeholder="新增层号，例：3层"
          emptyText="暂无层号"
          {...createListHandlers({
            label: '层号',
            items: floorItems,
            save: (next, text) => saveCampusList('campusFloors', next, text),
            notify,
            confirm,
          })}
        />
      </>
    );
  }

  // 自定义模块（如图书馆报修）：只维护按校区划分的楼层，具体地点由学生自行填写
  if (module.locationMode === 'custom') {
    return (
      <OptionListEditor
        title={`楼层设置（${selectedCampus}）`}
        items={floorItems}
        placeholder="新增楼层，例：3层"
        emptyText="暂无楼层（学生将自行填写）"
        {...createListHandlers({
          label: '楼层',
          items: floorItems,
          save: (next, text) => saveCampusList('campusFloors', next, text),
          notify,
          confirm,
        })}
      />
    );
  }

  // 教室报修、办公室报修：楼号 + 各楼号的房间号
  return (
    <>
      {buildingEditor}
      <BuildingScopedEditor
        title={`房间号设置（${selectedCampus}）`}
        label="房间号"
        buildings={buildingItems}
        listOf={(building) => scopedItemsOf('campusRooms', building)}
        save={(building, next, text) => saveBuildingList('campusRooms', building, next, text)}
        notify={notify}
        confirm={confirm}
        placeholder="新增房间号，例：101"
        emptyText="该楼号暂无房间号（学生将自行填写）"
      />
    </>
  );
}