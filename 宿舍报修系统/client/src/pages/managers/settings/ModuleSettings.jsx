import { useEffect, useRef, useState } from 'react';
import { useBuildingAccounts } from '../../../hooks/useBuildingAccounts';
import { useManagers } from '../../../hooks/useManagers';
import { DORM_MODULE_ID } from '../../../lib/modules';
import ModuleLocationSettings from './ModuleLocationSettings';

/**
 * 报修模块管理：左侧竖列模块（行末开关启用/停用、拖拽调整顺序），
 * 右侧是选中模块的设置区——「地点设置」（学生表单具体地点的选项，与宿舍楼号同类的维护入口）
 * 以及重命名 / 删除操作（收在「更多 ⋯」菜单里）。
 * 模块数组顺序即学生入口的展示顺序；宿舍报修模块不可删除（删除其他模块不会删除历史工单）。
 * campus：useCampusConfig 返回值（由 ManagersPanel 传入，与校区设置共用同一份配置状态）。
 * session：{ notify, confirm, onAuthLost }，宿管账号相关接口仅管理员可调用（本面板只对管理员渲染）。
 */
export default function ModuleSettings({ campus, adminToken, session }) {
  const [newName, setNewName] = useState('');
  const [dragIndex, setDragIndex] = useState(-1);
  const [overIndex, setOverIndex] = useState(-1);
  // 右侧设置区跟随选中的模块；默认选第一个（宿舍报修）
  const [selectedId, setSelectedId] = useState('');
  // 「更多 ⋯」菜单（修改 / 删除收在其中）默认收起，点击菜单外部自动关闭
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const { modules, moduleEditor, selectedCampus } = campus;

  useEffect(() => {
    if (!moreOpen) return undefined;
    const closeOnOutside = (event) => {
      if (moreRef.current && !moreRef.current.contains(event.target)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [moreOpen]);

  // 宿管账号与楼号的联动编排（宿舍报修模块的地点设置 = 楼号 + 宿管账号）
  const managers = useManagers(adminToken, selectedCampus, session);
  const buildingAccounts = useBuildingAccounts(campus, managers, session.notify, session.confirm);

  const selected = modules.find((item) => item.id === selectedId) || modules[0];
  const selectedIndex = selected ? modules.indexOf(selected) : -1;
  const selectedEditing = selectedIndex >= 0 && moduleEditor.index === selectedIndex;

  const clearDrag = () => {
    setDragIndex(-1);
    setOverIndex(-1);
  };

  const handleAdd = async () => {
    const ok = await campus.addModule(newName);
    if (ok) setNewName('');
  };

  const handleDrop = (index) => {
    campus.moveModule(dragIndex, index);
    clearDrag();
  };

  /** 启用/停用必须二次确认；在确认框里取消时输入框保持原状态（受控组件由 config 决定） */
  const handleToggle = async (item, nextEnabled) => {
    const ok = await session.confirm(
      nextEnabled
        ? `启用后学生入口会重新显示「${item.name}」。是否确认启用？`
        : `停用后学生入口将不再显示「${item.name}」（已提交的工单不受影响）。是否确认停用？`,
      {
        title: nextEnabled ? '启用模块' : '停用模块',
        confirmText: nextEnabled ? '确认启用' : '确认停用',
        danger: !nextEnabled,
      },
    );
    if (ok) campus.toggleModule(item.id, nextEnabled);
  };

  return (
    <div>
      <h3 style={{ marginTop: 28, marginBottom: 12 }}>模块管理</h3>
      <p className="module-hint">
        行末开关控制学生入口是否显示（启用 / 停用都要二次确认），未启用的模块会排在列表最后；拖动左侧拖拽柄可调整模块顺序。宿舍报修模块不可删除，宿管只处理宿舍工单。
      </p>
      <p className="module-hint">
        点击左侧模块行，即可在右侧维护该模块学生表单里的地点选项：楼号、食堂、层号、楼层按「当前校区」（{selectedCampus}）维护；实验室名称、房间号再按楼号细分，各楼号互不影响。选项未配置时学生可在表单里自行填写；切换校区请使用页面上方「校区设置」。重命名 / 删除收在右侧「更多 ⋯」菜单里。
      </p>

      <div className="module-add">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder="新增模块名称，例：图书馆报修"
        />
        <button type="button" className="primary-btn" onClick={handleAdd}>
          添加
        </button>
      </div>

      <div className="module-layout">
        <ul className="module-list" aria-label="报修模块">
          {modules.map((item, index) => {
            const isSelected = selected && item.id === selected.id;
            const editing = moduleEditor.index === index;

            return (
              <li
                key={item.id}
                className={
                  'module-row is-selectable' +
                  (item.enabled ? '' : ' is-disabled') +
                  (isSelected ? ' is-selected' : '') +
                  (dragIndex === index ? ' is-dragging' : '') +
                  (overIndex === index && dragIndex !== index ? ' is-drop-target' : '')
                }
                aria-current={isSelected ? 'true' : undefined}
                // 编辑态禁止拖动，避免在输入框里选中文字被当成拖拽
                draggable={!editing}
                onClick={() => setSelectedId(item.id)}
                onDragStart={() => {
                  setDragIndex(index);
                  setOverIndex(index);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOverIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDrop(index);
                }}
                onDragEnd={clearDrag}
              >
                <span className="drag-handle" aria-hidden="true">
                  ⠿
                </span>

                <button
                  type="button"
                  className="module-name"
                  onClick={() => setSelectedId(item.id)}
                >
                  {item.name}
                </button>

                {/* 开关位于行末（文字在开关左侧）；切换前二次确认，不改变右侧选中的模块 */}
                <label
                  className={`module-toggle${item.enabled ? '' : ' is-off'}`}
                  onClick={(event) => event.stopPropagation()}
                >
                  {item.enabled ? '启用' : '未启用'}
                  <input
                    type="checkbox"
                    checked={item.enabled}
                    aria-label={`${item.name}${item.enabled ? '已启用' : '未启用'}`}
                    onChange={(event) => handleToggle(item, event.target.checked)}
                  />
                </label>
              </li>
            );
          })}
        </ul>

        {selected ? (
          <div className="module-detail">
            <div className="module-detail-head">
              {selectedEditing ? (
                <>
                  <input
                    className="mini-edit module-detail-edit"
                    value={moduleEditor.value}
                    onChange={(event) => moduleEditor.change(event.target.value)}
                    aria-label={`重命名模块 ${selected.name}`}
                  />
                  <div className="module-actions">
                    <button type="button" className="mini-action" onClick={campus.saveModuleEdit}>
                      保存
                    </button>
                    <button type="button" className="mini-action" onClick={moduleEditor.cancel}>
                      取消
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="module-detail-name">{selected.name}</span>
                  {/* 修改 / 删除收进「更多 ⋯」菜单，默认收起避免误点 */}
                  <div className="module-more" ref={moreRef}>
                    <button
                      type="button"
                      className="mini-action"
                      aria-haspopup="menu"
                      aria-expanded={moreOpen}
                      onClick={() => setMoreOpen((value) => !value)}
                    >
                      更多 ⋯
                    </button>
                    {moreOpen ? (
                      <div className="module-more-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMoreOpen(false);
                            moduleEditor.start(selectedIndex, selected.name);
                          }}
                        >
                          修改
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="is-danger"
                          disabled={selected.id === DORM_MODULE_ID}
                          title={selected.id === DORM_MODULE_ID ? '宿舍报修模块不可删除' : undefined}
                          onClick={() => {
                            setMoreOpen(false);
                            campus.deleteModule(selected.id);
                          }}
                        >
                          删除
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              )}
            </div>

            <ModuleLocationSettings
              module={selected}
              campus={campus}
              session={session}
              buildingAccounts={buildingAccounts}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}