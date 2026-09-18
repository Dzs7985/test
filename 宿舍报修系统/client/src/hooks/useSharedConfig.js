import { useCallback, useEffect, useState } from 'react';
import { fetchConfig, normalizeConfig } from '../lib/api';
import { getDefaultConfig } from '../lib/constants';

const syncEventName = 'dorm-config-sync';

/**
 * 全局共享的校区/楼号配置：负责首次加载，并监听跨页面同步事件。
 * 学生页与管理页都依赖它，保证配置变更后各页面自动刷新。
 */
export function useSharedConfig() {
  const [config, setConfig] = useState(getDefaultConfig());

  const refresh = useCallback(async () => {
    const next = await fetchConfig();
    if (next) setConfig(next);
  }, []);

  useEffect(() => {
    refresh();

    const handleSync = (event) => {
      const detail = event.detail;
      if (!detail) {
        refresh();
        return;
      }
      const next = normalizeConfig({
        campuses: detail.campuses,
        buildings: detail.buildings,
        campusBuildings: detail.campusBuildings,
        emergencyPhone: detail.emergencyPhone,
      });
      if (next) setConfig(next);
    };

    const handleStorage = () => refresh();

    window.addEventListener(syncEventName, handleSync);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener(syncEventName, handleSync);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refresh]);

  return { config, refresh };
}