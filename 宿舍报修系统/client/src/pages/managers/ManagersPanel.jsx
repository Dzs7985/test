import { useMemo, useState } from 'react';
import ConfirmDialog from '../../components/ConfirmDialog';
import StatusToast from '../../components/StatusToast';
import { useConfirm } from '../../hooks/useConfirm';
import { useNotice } from '../../hooks/useNotice';
import { useRepairs } from '../../hooks/useRepairs';
import AdminConfigSections from './settings/AdminConfigSections';
import RepairsBoard from './RepairsBoard';
import StatsBoard from './StatsBoard';
import RepairsFilters, {
  applyRepairFilters,
  emptyRepairFilters,
  hasActiveFilters,
  normalizeFilters,
} from './RepairsFilters';

/** 左侧主菜单：点击切换右侧内容区显示哪一块 */
const menus = [
  { key: 'config', label: '校区和楼号设置' },
  { key: 'stats', label: '数据统计看板' },
  { key: 'repairs', label: '报修工单管理' },
];

export default function ManagersPanel({ adminToken, config, onAuthLost }) {
  const { notice, notify, clearNotice } = useNotice();
  const { dialogProps, confirm, handleConfirm, handleCancel } = useConfirm();
  const [activeMenu, setActiveMenu] = useState('config');
  const [filters, setFilters] = useState(emptyRepairFilters);

  const session = useMemo(() => ({ notify, confirm, onAuthLost }), [notify, confirm, onAuthLost]);

  const repairs = useRepairs(adminToken, session);

  // 工单按校区 / 楼号 / 时间 / 状态筛选，只影响显示，不触发重新请求；选项与「校区和楼号设置」同步
  const activeFilters = useMemo(() => normalizeFilters(filters, config), [filters, config]);
  const visibleRecords = useMemo(
    () => applyRepairFilters(repairs.records, activeFilters),
    [repairs.records, activeFilters],
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
          {/* 两块内容都保持挂载、只切换显示：来回切菜单不会重新拉取配置和工单，未保存的编辑内容也不会丢 */}
          <div hidden={activeMenu !== 'config'}>
            <AdminConfigSections adminToken={adminToken} session={session} />
          </div>
          <div hidden={activeMenu !== 'stats'}>
            <StatsBoard records={repairs.records} loading={repairs.loading} />
          </div>
          <div hidden={activeMenu !== 'repairs'}>
            <RepairsBoard
              repairs={repairs}
              canDelete
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