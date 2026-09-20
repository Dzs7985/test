import StatusToast from '../../components/StatusToast';
import { useNotice } from '../../hooks/useNotice';
import { useRepairs } from '../../hooks/useRepairs';
import RepairsBoard from './RepairsBoard';

/** 宿管视图：只能看到自己校区、自己楼号的工单，可标记已处理；删除权限在此显式关闭（后端同样拦截）。 */
export default function ManagerRepairsPanel({ session, onAuthLost }) {
  const { notice, notify, clearNotice } = useNotice();
  const repairs = useRepairs(session.token, { notify, onAuthLost, canDelete: false });

  const title = [session.campus, session.building].filter(Boolean).join(' ');

  return (
    <div>
      <StatusToast notice={notice} onClose={clearNotice} />
      <RepairsBoard repairs={repairs} title={`${title} 报修工单`} />
    </div>
  );
}