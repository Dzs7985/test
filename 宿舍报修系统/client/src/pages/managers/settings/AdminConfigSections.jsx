import CampusSettings from './CampusSettings';

/**
 * 管理员「校区与模块设置」页里的校区部分：只负责校区增删改（当前校区）。
 * 与「模块管理」合并在同一页里上下排列，因此保留小标题做区块分隔。
 * 楼号、宿管账号与紧急联系电话已迁入「模块管理 → 宿舍报修」，本面板不再负责。
 * campus（useCampusConfig）由 ManagersPanel 上提传入，与「模块管理」共用同一份配置状态。
 */
export default function AdminConfigSections({ campus }) {
  return (
    <>
      <h3 style={{ marginTop: 0 }}>校区设置</h3>
      <CampusSettings campus={campus} />
    </>
  );
}