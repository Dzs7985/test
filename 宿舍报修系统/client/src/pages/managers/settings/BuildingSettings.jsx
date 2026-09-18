import { useEffect, useState } from 'react';
import AlnumInput from '../../../components/AlnumInput';
import { BUILDING_SUFFIX } from '../../../hooks/useBuildingAccounts';
import { DEFAULT_INITIAL_PASSWORD } from '../../../lib/constants';

/** 范围输入只保留数字，避免「3号楼」这类文字混进来 */
const onlyDigits = (value) => (value || '').replace(/\D/g, '');

/**
 * 楼号与其宿管账号：左侧按「由 N 到 M 号楼」一键生成楼号（同时自动建账号），右侧显示选中楼号的账号（可改用户名与密码）。
 * 楼号与账号 1:1 绑定：生成楼号会自动建账号，删除楼号会连带删除账号。
 */
export default function BuildingSettings({ campus, buildingAccounts }) {
  const [startNo, setStartNo] = useState('');
  const [endNo, setEndNo] = useState('');
  const [selected, setSelected] = useState('');
  const [draftUsername, setDraftUsername] = useState('');
  const [draftPassword, setDraftPassword] = useState('');
  // 查看态（按钮显示「修改」）与编辑态（按钮显示「保存」）：默认只读，避免误改已保存的账号
  const [editing, setEditing] = useState(false);

  const { buildings, buildingEditor } = campus;
  const account = selected ? buildingAccounts.accountFor(selected) : null;

  // 切换校区或楼号增删后，保证选中的楼号始终有效
  useEffect(() => {
    if (buildings.includes(selected)) return;
    setSelected(buildings[0] || '');
  }, [buildings, selected]);

  useEffect(() => {
    setDraftUsername(account ? account.username : '');
    setDraftPassword(account ? account.password : '');
    // 切换楼号或保存成功后回到查看态
    setEditing(false);
  }, [account]);

  const handleAdd = async () => {
    const added = await buildingAccounts.addBuildingsWithAccounts(startNo, endNo);
    if (!added) return;
    setStartNo('');
    setEndNo('');
    // 生成后直接选中第一个新楼号，右侧即可看到自动生成的账号
    setSelected(added[0]);
  };

  const handleRemove = async (value) => {
    await buildingAccounts.removeBuildingWithAccount(value);
  };

  const handleSaveAccount = async () => {
    if (!account) return;
    const saved = await buildingAccounts.updateAccount(account, draftUsername, draftPassword);
    // 保存成功即回到查看态（按钮变回「修改」），失败则留在编辑态便于继续修正
    if (saved) setEditing(false);
  };

  return (
    <div className="config-card">
      <h4>楼号</h4>

      <div className="building-layout">
        <div className="building-col">
          <div className="building-add">
            <span className="range-label">由</span>
            <input
              className="range-input"
              value={startNo}
              onChange={(event) => setStartNo(onlyDigits(event.target.value))}
              inputMode="numeric"
              aria-label="起始楼号"
            />
            <span className="range-label">到</span>
            <input
              className="range-input"
              value={endNo}
              onChange={(event) => setEndNo(onlyDigits(event.target.value))}
              inputMode="numeric"
              aria-label="结束楼号"
            />
            <span className="range-label">{BUILDING_SUFFIX}</span>
            <button className="primary-btn" type="button" onClick={handleAdd}>
              一键生成
            </button>
          </div>

          <ul className="building-list">
            {buildings.length === 0 ? (
              <li className="empty">暂无楼号</li>
            ) : (
              buildings.map((item, index) => (
                <li key={item} className={'building-row' + (item === selected ? ' is-selected' : '')}>
                  {buildingEditor.index === index ? (
                    <>
                      <input
                        className="mini-edit"
                        value={buildingEditor.value}
                        onChange={(event) => buildingEditor.change(event.target.value)}
                        aria-label={`重命名楼号 ${item}`}
                      />
                      <button
                        type="button"
                        className="mini-action"
                        onClick={buildingAccounts.saveBuildingEditWithAccount}
                      >
                        保存
                      </button>
                      <button type="button" className="mini-action" onClick={buildingEditor.cancel}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="building-name" onClick={() => setSelected(item)}>
                        <span>{item}</span>
                      </button>
                      <button
                        type="button"
                        className="mini-action"
                        onClick={() => buildingEditor.start(index, item)}
                      >
                        修改
                      </button>
                      <button
                        type="button"
                        className="mini-action is-danger"
                        onClick={() => handleRemove(item)}
                      >
                        删除
                      </button>
                    </>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="account-col">
          <div className="account-title">{selected ? `${selected} 宿管账号` : '宿管账号'}</div>

          {!selected ? (
            <p className="empty">请先选择楼号</p>
          ) : account ? (
            <>
              <label className="account-field">
                用户名
                <AlnumInput
                  value={draftUsername}
                  onChange={setDraftUsername}
                  placeholder="用户名"
                  readOnly={!editing}
                />
              </label>
              <label className="account-field">
                密码
                <AlnumInput
                  value={draftPassword}
                  onChange={setDraftPassword}
                  placeholder="密码"
                  readOnly={!editing}
                />
              </label>
              {editing ? (
                <button className="primary-btn" type="button" onClick={handleSaveAccount}>
                  保存
                </button>
              ) : (
                <button className="secondary-btn" type="button" onClick={() => setEditing(true)}>
                  修改
                </button>
              )}
              <p className="account-hint">
                一键生成楼号时会一并创建宿管账号，初始密码为 {DEFAULT_INITIAL_PASSWORD}，可在上方查看或修改。
              </p>
            </>
          ) : (
            <>
              <p className="empty">暂无账号</p>
              <button
                className="primary-btn"
                type="button"
                onClick={() => buildingAccounts.createAccountFor(selected)}
              >
                生成账号
              </button>
              <p className="account-hint">
                生成账号后初始密码为 {DEFAULT_INITIAL_PASSWORD}，可在上方查看或修改。
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}