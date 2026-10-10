import { useMemo, useState } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import StatusToast from '../../components/StatusToast';
import { useCampusConfig } from '../../hooks/useCampusConfig';
import { useConfirm } from '../../hooks/useConfirm';
import { useNotice } from '../../hooks/useNotice';
import { useRepairs } from '../../hooks/useRepairs';
import AdminConfigSections from './settings/AdminConfigSections';
import ModuleSettings from './settings/ModuleSettings';
import RepairsBoard from './RepairsBoard';
import TrashPanel from './TrashPanel';
import RepairsFilters, {
  applyRepairFilters,
  emptyRepairFilters,
  hasActiveFilters,
  normalizeFilters,
} from './RepairsFilters';

/** 顶部标签页：点击切换下方内容区显示哪一块 */
const menus = [
  { key: 'settings', label: '校区与模块设置' },
  { key: 'repairs', label: '报修工单管理' },
  { key: 'trash', label: '回收站' },
];

export default function ManagersPanel({ adminToken, config, onAuthLost }) {
  const { notice, notify, clearNotice } = useNotice();
  const { dialogProps, confirm, handleConfirm, handleCancel } = useConfirm();
  const [activeMenu, setActiveMenu] = useState('settings');
  const [filters, setFilters] = useState(emptyRepairFilters);

  const session = useMemo(() => ({ notify, confirm, onAuthLost }), [notify, confirm, onAuthLost]);

  // 配置状态上提到这里：「校区设置」与「模块管理」共用同一份，避免各持一份导致模块列表不同步
  const campus = useCampusConfig(adminToken, notify, confirm);

  // 管理员是唯一有删除权限的角色，显式开启（useRepairs 默认拒绝）
  const repairs = useRepairs(adminToken, { ...session, canDelete: true });

  // 工单按校区 / 模块 / 地点 / 时间 / 状态筛选，只影响显示，不触发重新请求；地点选项随模块变化，与「校区与模块设置」同步
  const activeFilters = useMemo(() => normalizeFilters(filters, config), [filters, config]);
  const visibleRecords = useMemo(
    () => applyRepairFilters(repairs.records, activeFilters, config),
    [repairs.records, activeFilters, config],
  );

  return (
    <div>
      <StatusToast notice={notice} onClose={clearNotice} />

      <div className="admin-layout">
        <nav className="admin-menu" aria-label="管理菜单">
          {menus.map((item) => (
            <button
              key={item.key}
              type="button"
              className={'admin-menu-item' + (activeMenu === item.key ? ' is-active' : '')}
              aria-current={activeMenu === item.key ? 'page' : undefined}
              onClick={() => setActiveMenu(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="admin-content">
          {/* 两块内容都保持挂载、只切换显示：来回切标签不会重新拉取配置和工单，未保存的编辑内容也不会丢 */}
          <div hidden={activeMenu !== 'settings'}>
            <AdminConfigSections campus={campus} />
            <ModuleSettings campus={campus} adminToken={adminToken} session={session} />
          </div>
          <div hidden={activeMenu !== 'repairs'}>
            <RepairsBoard
              repairs={repairs}
              config={config}
              records={visibleRecords}
              emptyText={hasActiveFilters(activeFilters) ? '没有符合筛选条件的工单' : '暂无报修工单'}
              toolbar={
                <RepairsFilters
                  records={repairs.records}
                  config={config}
                  filters={activeFilters}
                  onChange={setFilters}
                  matched={visibleRecords.length}
                />
              }
            />
          </div>
          {/* 回收站不常驻挂载：每次切进来都重新拉取，保证看到的是最新条目 */}
          {activeMenu === 'trash' ? <TrashPanel adminToken={adminToken} session={session} /> : null}
        </div>
      </div>

      <ConfirmDialog
        open={dialogProps.open}
        title={dialogProps.title}
        message={dialogProps.message}
        confirmText={dialogProps.confirmText}
        cancelText={dialogProps.cancelText}
        danger={dialogProps.danger}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
}