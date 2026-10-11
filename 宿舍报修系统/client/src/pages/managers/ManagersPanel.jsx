import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ConfirmDialog from '../../components/ConfirmDialog';
import StatusToast from '../../components/StatusToast';
import { useCampusConfig } from '../../hooks/useCampusConfig';
import { useConfirm } from '../../hooks/useConfirm';
import { useNotice } from '../../hooks/useNotice';
import { useRepairs } from '../../hooks/useRepairs';
import { REPAIR_STATUS_DONE, REPAIR_STATUS_PENDING } from '../../lib/constants';
import AdminConfigSections from './settings/AdminConfigSections';
import ModuleSettings from './settings/ModuleSettings';
import LostItemsPanel from './LostItemsPanel';
import RepairsBoard from './RepairsBoard';
import StatsBoard from './StatsBoard';
import TrashPanel from './TrashPanel';
import RepairsFilters, {
  applyRepairFilters,
  emptyRepairFilters,
  hasActiveFilters,
  normalizeFilters,
} from './RepairsFilters';

/** 顶部标签页：点击切换下方内容区显示哪一块 */
const menus = [
  { key: 'config', label: '校区与模块设置' },
  { key: 'repairs', label: '报修工单管理' },
  { key: 'lostitems', label: '失物招领管理' },
  { key: 'trash', label: '回收站' },
];

/** 从看板跳转的工单列表页标题：?status=pending / done */
const STATUS_VIEW_TITLES = {
  pending: `${REPAIR_STATUS_PENDING}工单`,
  done: `${REPAIR_STATUS_DONE}工单`,
};

export default function ManagersPanel({ adminToken, config, onAuthLost }) {
  const { notice, notify, clearNotice } = useNotice();
  const { dialogProps, confirm, handleConfirm, handleCancel } = useConfirm();
  const [activeMenu, setActiveMenu] = useState('config');
  const [filters, setFilters] = useState(emptyRepairFilters);
  const [searchParams, setSearchParams] = useSearchParams();
  // 看板点击「未完成 / 已完成」→ 跳转到 ?status=pending|done 的独立列表页；
  // 地址栏保留状态，顶栏左上角「返回」即可回到看板（不额外加页内返回入口）
  const viewStatus = searchParams.get('status');

  const session = useMemo(() => ({ notify, confirm, onAuthLost }), [notify, confirm, onAuthLost]);

  // 配置状态上提到这里：「校区设置」与「模块管理」共用同一份，避免各持一份导致模块列表不同步
  const campus = useCampusConfig(adminToken, notify, confirm);

  // 管理员是唯一有删除权限的角色，显式开启（useRepairs 默认拒绝）
  const repairs = useRepairs(adminToken, { ...session, canDelete: true });

  // 工单按校区 / 模块 / 地点 / 时间 / 状态筛选，只影响显示，不触发重新请求；地点选项随模块变化，与「校区与模块设置」同步
  const activeFilters = useMemo(() => normalizeFilters(filters, config), [filters, config]);
  // 从看板跳转来的列表页：状态由页面固定，其余筛选仍可继续缩小范围
  const listFilters = useMemo(
    () => (viewStatus ? { ...activeFilters, status: viewStatus } : activeFilters),
    [activeFilters, viewStatus],
  );
  const visibleRecords = useMemo(
    () => applyRepairFilters(repairs.records, listFilters, config),
    [repairs.records, listFilters, config],
  );

  /** 点击看板「未完成 / 已完成」：清掉旧筛选并带上状态跳转到独立列表页（顶栏返回可回到看板） */
  const openStatusView = (status) => {
    setActiveMenu('repairs');
    setFilters(emptyRepairFilters);
    setSearchParams({ status });
  };

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
              onClick={() => {
                setActiveMenu(item.key);
                // 切菜单即退出状态列表页，回到常规看板视图
                if (viewStatus) setSearchParams({});
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="admin-content">
          {/* 两块内容都保持挂载、只切换显示：来回切标签不会重新拉取配置和工单，未保存的编辑内容也不会丢 */}
          <div hidden={activeMenu !== 'config'}>
            <AdminConfigSections campus={campus} />
            <ModuleSettings campus={campus} adminToken={adminToken} session={session} />
          </div>
          <div hidden={activeMenu !== 'repairs'}>
            {/* 看板与工单明细同页；点「未完成 / 已完成」跳转到只含该状态的列表页，此时不显示看板 */}
            {viewStatus ? null : (
              <StatsBoard
                records={repairs.records}
                loading={repairs.loading}
                onPickStatus={openStatusView}
              />
            )}
            <RepairsBoard
              repairs={repairs}
              config={config}
              records={visibleRecords}
              title={STATUS_VIEW_TITLES[viewStatus] || '报修工单明细'}
              emptyText={
                viewStatus
                  ? '暂无符合条件的工单'
                  : hasActiveFilters(activeFilters)
                    ? '没有符合筛选条件的工单'
                    : '暂无报修工单'
              }
              toolbar={
                <RepairsFilters
                  config={config}
                  filters={listFilters}
                  onChange={setFilters}
                  lockedStatus={Boolean(viewStatus)}
                />
              }
            />
          </div>
          {/* 失物招领与回收站都不常驻挂载：每次切进来都重新拉取，保证看到的是最新数据 */}
          {activeMenu === 'lostitems' ? <LostItemsPanel /> : null}
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