import { useBuildingAccounts } from '../../../hooks/useBuildingAccounts';
import { useCampusConfig } from '../../../hooks/useCampusConfig';
import { useManagers } from '../../../hooks/useManagers';
import BuildingSettings from './BuildingSettings';
import CampusSettings from './CampusSettings';
import EmergencyPhoneSettings from './EmergencyPhoneSettings';

/**
 * 管理员专属的校区 / 楼号 / 宿管账号配置区。
 * 这几个 hook 会调用管理员接口，宿管会话不会挂载这里，避免无谓的 403。
 */
export default function AdminConfigSections({ adminToken, session }) {
  const campus = useCampusConfig(adminToken, session.notify, session.confirm);
  const managers = useManagers(adminToken, campus.selectedCampus, session);
  const buildingAccounts = useBuildingAccounts(campus, managers, session.notify, session.confirm);

  return (
    <>
      <h3 style={{ marginTop: 0 }}>校区和楼号设置</h3>
      <CampusSettings campus={campus} />
      <BuildingSettings campus={campus} buildingAccounts={buildingAccounts} />
      <EmergencyPhoneSettings campus={campus} />
    </>
  );
}