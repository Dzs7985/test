import { useEffect, useMemo, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';
import { submitRepair } from '../lib/api';
import { defaultCampusOptions, initialForm, repairCategories } from '../lib/constants';

export default function StudentPage({ config }) {
  const [form, setForm] = useState(initialForm);
  const [image, setImage] = useState(null);
  const [message, setMessage] = useState('');
  const { dialogProps, confirm, handleConfirm, handleCancel } = useConfirm();

  const campuses = config?.campuses || defaultCampusOptions;

  useEffect(() => {
    if (!config) return;
    setForm((prev) => ({
      ...prev,
      campus: config.campuses?.includes(prev.campus) ? prev.campus : '',
      building:
        prev.campus && config.campusBuildings?.[prev.campus]?.includes(prev.building) ? prev.building : '',
    }));
  }, [config]);

  const buildingOptions = useMemo(() => {
    if (!form.campus) return [];
    return config?.campusBuildings?.[form.campus] || [];
  }, [config, form.campus]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    const nextValue = name === 'contact' ? value.replace(/\D/g, '').slice(0, 11) : value;
    setForm((prev) => ({
      ...prev,
      [name]: nextValue,
      ...(name === 'campus' ? { building: '' } : {}),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    // 提交前二次确认：把关键信息回显一遍，避免误填或误点直接提交
    const location = [form.campus, form.building, form.roomNumber].filter(Boolean).join(' / ');
    const confirmed = await confirm(
      `请确认信息无误：${location}｜故障类型：${form.category}。确认后将提交给对应楼号的宿管处理。`,
      { title: '确认提交报修', confirmText: '确认提交' },
    );
    if (!confirmed) return;

    const payload = new FormData();
    Object.entries(form).forEach(([key, value]) => payload.append(key, value));
    if (image) payload.append('image', image);

    const { ok, data } = await submitRepair(payload);
    if (!ok) {
      setMessage(data.error || '提交失败');
      return;
    }

    setMessage('报修提交成功，已进入待处理列表。');
    setForm({ ...initialForm });
    setImage(null);
  };

  return (
    <div className="page">
      <section className="panel">
        <h2>学生提交报修</h2>
        <form onSubmit={handleSubmit} className="repair-form">
          <div className="field-row">
            <label>
              姓名
              <input name="name" value={form.name} onChange={handleChange} placeholder="必填" required />
            </label>
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

          <div className="field-row">
            <label>
              校区
              <select name="campus" value={form.campus} onChange={handleChange} required>
                <option value="">请选择（必选）</option>
                {campuses.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              楼号
              <select
                name="building"
                value={form.building}
                onChange={handleChange}
                required
                disabled={!form.campus}
              >
                <option value="">{form.campus ? '请选择（必选）' : '请先选择校区'}</option>
                {buildingOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-row">
            <label>
              房间号
              <input name="roomNumber" value={form.roomNumber} onChange={handleChange} placeholder="必填" required />
            </label>
            <div />
          </div>

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