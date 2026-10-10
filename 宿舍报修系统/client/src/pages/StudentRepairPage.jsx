import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog';
import RepairSubmitSuccessDialog from '../components/RepairSubmitSuccessDialog';
import { useConfirm } from '../hooks/useConfirm';
import { submitRepair } from '../lib/api';
import { defaultCampusOptions, initialForm, repairCategories } from '../lib/constants';
import { buildingFieldListOf, campusFieldListOf, campusListOf, formatRepairLocation } from '../lib/locationOptions';
import { findModule } from '../lib/modules';

/**
 * 按模块提交报修，地点字段由模块的 locationMode 决定（选项由管理员在「模块管理 → 地点设置」维护）：
 * 宿舍 → 校区 + 楼号 + 房间号（分派给楼号宿管）；实验室 → 校区 + 楼号 + 实验室；
 * 食堂 → 校区 + 食堂 + 层号；教室/办公室 → 校区 + 楼号 + 房间号；其余模块（自定义）→ 校区 + 楼层 + 具体地点；
 * 实验室与房间号的选项按楼号维护，该楼号未配置选项时学生自行填写；楼层按校区维护，未配置时同样自行填写。
 * 某一级只有一个选项时，上一级选好后自动带入该项并以只读文本展示，学生无需再点选。
 */
export default function StudentRepairPage({ config }) {
  const { moduleId } = useParams();
  const [form, setForm] = useState(initialForm);
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState('');
  // 提交成功后的结果（含查询码）：弹窗展示，学生凭查询码或提交时填写的手机号在「查询进度」页自查
  const [result, setResult] = useState(null);
  const { dialogProps, confirm, handleConfirm, handleCancel } = useConfirm();

  const mod = findModule(config, moduleId);
  const mode = mod?.locationMode || 'custom';
  const isDorm = mode === 'building';
  const campuses = config?.campuses || defaultCampusOptions;

  // 同一路由只换 moduleId 时组件不会重新挂载，必须显式把上次的表单内容重置干净
  useEffect(() => {
    setForm(initialForm);
    setImage(null);
    setMessage('');
    setResult(null);
  }, [moduleId]);

  // 配置变化后清掉已失效的选择（管理员可能改名或删除了校区、楼号、食堂、实验室、房间号）
  useEffect(() => {
    if (!config) return;
    setForm((prev) => {
      const campus = config.campuses?.includes(prev.campus) ? prev.campus : '';
      const buildings = campusListOf(config, moduleId, campus);
      const building = buildings.includes(prev.building) ? prev.building : '';
      const canteens = campusListOf(config, 'canteen', campus);
      const labs = buildingFieldListOf(config, 'lab', 'campusLabs', campus, building);
      const rooms = buildingFieldListOf(config, moduleId, 'campusRooms', campus, building);
      const floors = campusFieldListOf(config, moduleId, 'campusFloors', campus);
      const usesFloor = mode === 'canteen' || mode === 'custom';
      // 链路：没选楼号先清空；该楼号未配置选项时保留学生自填的值，配置了选项则必须在选项内
      const scoped = (list, value) => (!building || (list.length && !list.includes(value)) ? '' : value);
      return {
        ...prev,
        campus,
        building,
        canteen: canteens.includes(prev.canteen) ? prev.canteen : '',
        lab: mode === 'lab' ? scoped(labs, prev.lab) : '',
        roomNumber: mode === 'room' ? scoped(rooms, prev.roomNumber) : prev.roomNumber,
        // 楼层同理：未配置楼层时保留学生自填的值，配置了选项则必须在选项内
        floor: usesFloor && floors.length && !floors.includes(prev.floor) ? '' : prev.floor,
      };
    });
  }, [config, moduleId, mode]);

  const buildingOptions = useMemo(() => campusListOf(config, moduleId, form.campus), [config, moduleId, form.campus]);
  const canteenOptions = useMemo(() => campusListOf(config, 'canteen', form.campus), [config, form.campus]);
  const labOptions = useMemo(
    () => buildingFieldListOf(config, 'lab', 'campusLabs', form.campus, form.building),
    [config, form.campus, form.building],
  );
  const roomOptions = useMemo(
    () => buildingFieldListOf(config, moduleId, 'campusRooms', form.campus, form.building),
    [config, moduleId, form.campus, form.building],
  );
  const floorOptions = useMemo(
    () => campusFieldListOf(config, moduleId, 'campusFloors', form.campus),
    [config, moduleId, form.campus],
  );

  // 「选项只有一个」时无需再选：上一级选定后自动带入该项，界面用只读文本展示（列表为空仍回退输入框）
  // 各字段按当前模式收紧，避免读取到其他模块维护的列表后串值
  const singlePick = (list, ready) => (ready && list.length === 1 ? list[0] : '');
  const uniqueCampus = campuses.length === 1 ? campuses[0] : '';
  const uniqueBuilding =
    mode === 'building' || mode === 'lab' || mode === 'room' ? singlePick(buildingOptions, Boolean(form.campus)) : '';
  const uniqueCanteen = mode === 'canteen' ? singlePick(canteenOptions, Boolean(form.campus)) : '';
  const uniqueFloor =
    mode === 'canteen' || mode === 'custom' ? singlePick(floorOptions, Boolean(form.campus)) : '';
  const uniqueLab = mode === 'lab' ? singlePick(labOptions, Boolean(form.building)) : '';
  const uniqueRoom = mode === 'room' ? singlePick(roomOptions, Boolean(form.building)) : '';

  useEffect(() => {
    setForm((prev) => {
      const patch = {};
      if (uniqueCampus && prev.campus !== uniqueCampus) patch.campus = uniqueCampus;
      if (uniqueBuilding && prev.building !== uniqueBuilding) patch.building = uniqueBuilding;
      if (uniqueCanteen && prev.canteen !== uniqueCanteen) patch.canteen = uniqueCanteen;
      if (uniqueFloor && prev.floor !== uniqueFloor) patch.floor = uniqueFloor;
      if (uniqueLab && prev.lab !== uniqueLab) patch.lab = uniqueLab;
      if (uniqueRoom && prev.roomNumber !== uniqueRoom) patch.roomNumber = uniqueRoom;
      return Object.keys(patch).length ? { ...prev, ...patch } : prev;
    });
  }, [uniqueCampus, uniqueBuilding, uniqueCanteen, uniqueFloor, uniqueLab, uniqueRoom]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === 'contact' ? value.replace(/\D/g, '').slice(0, 11) : value;
    setForm((prev) => ({
      ...prev,
      [name]: nextValue,
      // 换校区后楼号/食堂/层号都不再保证属于该校区；换楼号后实验室/房间号同理，清空重新选择
      ...(name === 'campus' ? { building: '', canteen: '', lab: '', floor: '', roomNumber: '' } : {}),
      ...(name === 'building' ? { lab: '', roomNumber: '' } : {}),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // 提交前二次确认：把关键信息回显一遍，避免误填或误点直接提交
    const location = formatRepairLocation(form);
    const target = isDorm ? '对应楼号的宿管' : '管理员';
    const confirmed = await confirm(
      `请确认信息无误：${location}｜故障类型：${form.category}。确认后将提交给${target}处理。`,
      { title: '确认提交报修', confirmText: '确认提交' },
    );
    if (!confirmed) return;

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    payload.append('module', moduleId);
    if (image) payload.append('image', image);

    const { ok, data } = await submitRepair(payload);
    if (!ok) {
      setMessage(data.error || '提交失败');
      return;
    }

    setMessage('');
    setResult({ code: data.code || '' });
    setForm({ ...initialForm });
    setImage(null);
  };

  if (!mod || !mod.enabled) {
    return (
      <div className="page">
        <section className="panel">
          <h2>该报修模块不存在或已停用</h2>
          <p className="module-hint">请点击左上角返回按钮，选择其他报修类型。</p>
        </section>
      </div>
    );
  }

  // 校区字段复用于两种布局：宿舍与楼号同排，非宿舍与联系方式同排
  const campusField = (
    <label>
      校区
      {uniqueCampus ? (
        <p className="field-static">{uniqueCampus}</p>
      ) : (
        <select name="campus" value={form.campus} onChange={handleChange} required>
          <option value="">请选择（必选）</option>
          {campuses.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </label>
  );

  // 楼号下拉：宿舍、实验室、教室/办公室共用，选项按所选校区从该模块的楼号列表里取
  const buildingField = (
    <label>
      楼号
      {uniqueBuilding ? (
        <p className="field-static">{uniqueBuilding}</p>
      ) : (
        <select name="building" value={form.building} onChange={handleChange} required disabled={!form.campus}>
          <option value="">{form.campus ? '请选择（必选）' : '请先选择校区'}</option>
          {buildingOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}
    </label>
  );

  return (
    <div className="page">
      <section className="panel">
        <div className="module-form-head">
          <h2>{mod.name}</h2>
        </div>

        {result ? <RepairSubmitSuccessDialog code={result.code} onClose={() => setResult(null)} /> : null}

        <form onSubmit={handleSubmit} className="repair-form">
          <div className="field-row">
            {isDorm ? (
              <label>
                姓名
                <input name="name" value={form.name} onChange={handleChange} placeholder="必填" required />
              </label>
            ) : (
              campusField
            )}
            <label>
              联系方式
              <input
                name="contact"
                value={form.contact}
                onChange={handleChange}
                placeholder="例：13800000000（必填）"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={11}
                required
              />
            </label>
          </div>

          {isDorm ? (
            <>
              <div className="field-row">
                {campusField}
                {buildingField}
              </div>

              <div className="field-row">
                <label>
                  房间号
                  <input
                    name="roomNumber"
                    value={form.roomNumber}
                    onChange={handleChange}
                    placeholder="必填"
                    required
                  />
                </label>
                <div />
              </div>
            </>
          ) : mode === 'lab' ? (
            <div className="field-row">
              {buildingField}
              <label>
                实验室
                {uniqueLab ? (
                  <p className="field-static">{uniqueLab}</p>
                ) : labOptions.length ? (
                  <select name="lab" value={form.lab} onChange={handleChange} required>
                    <option value="">请选择（必选）</option>
                    {labOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="lab"
                    value={form.lab}
                    onChange={handleChange}
                    placeholder={form.building ? '该楼号暂未配置实验室，请填写名称' : '请先选择楼号'}
                    required
                  />
                )}
              </label>
            </div>
          ) : mode === 'canteen' ? (
            <div className="field-row">
              <label>
                食堂
                {uniqueCanteen ? (
                  <p className="field-static">{uniqueCanteen}</p>
                ) : (
                  <select name="canteen" value={form.canteen} onChange={handleChange} required disabled={!form.campus}>
                    <option value="">{form.campus ? '请选择（必选）' : '请先选择校区'}</option>
                    {canteenOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label>
                层号
                {uniqueFloor ? (
                  <p className="field-static">{uniqueFloor}</p>
                ) : (
                  <select name="floor" value={form.floor} onChange={handleChange} required disabled={!form.campus}>
                    <option value="">{form.campus ? '请选择（必选）' : '请先选择校区'}</option>
                    {floorOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            </div>
          ) : mode === 'room' ? (
            <div className="field-row">
              {buildingField}
              <label>
                房间号
                {uniqueRoom ? (
                  <p className="field-static">{uniqueRoom}</p>
                ) : roomOptions.length ? (
                  <select name="roomNumber" value={form.roomNumber} onChange={handleChange} required>
                    <option value="">请选择（必选）</option>
                    {roomOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="roomNumber"
                    value={form.roomNumber}
                    onChange={handleChange}
                    placeholder={form.building ? '该楼号暂未配置房间号，请填写' : '请先选择楼号'}
                    required
                  />
                )}
              </label>
            </div>
          ) : (
            <div className="field-row">
              <label>
                楼层
                {uniqueFloor ? (
                  <p className="field-static">{uniqueFloor}</p>
                ) : floorOptions.length ? (
                  <select name="floor" value={form.floor} onChange={handleChange} required disabled={!form.campus}>
                    <option value="">{form.campus ? '请选择（必选）' : '请先选择校区'}</option>
                    {floorOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    name="floor"
                    value={form.floor}
                    onChange={handleChange}
                    placeholder={form.campus ? '该模块暂未配置楼层，请填写' : '请先选择校区'}
                    required
                  />
                )}
              </label>
              <label>
                具体地点
                <input
                  name="location"
                  value={form.location}
                  onChange={handleChange}
                  placeholder="例：东侧阅览室（必填）"
                  required
                />
              </label>
            </div>
          )}

          <div className="field-row">
            <label>
              故障类型
              <select name="category" value={form.category} onChange={handleChange} required>
                <option value="">请选择（必选）</option>
                {repairCategories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <div />
          </div>

          <label>
            问题描述
            <textarea
              name="description"
              rows="4"
              value={form.description}
              onChange={handleChange}
              placeholder="请简要描述问题（必填）"
              required
            />
          </label>

          <label>
            上传照片（可选）
            <input type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] || null)} />
          </label>

          <button type="submit" className="primary-btn">
            提交报修
          </button>
          {message ? <p className="message">{message}</p> : null}
        </form>
      </section>

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