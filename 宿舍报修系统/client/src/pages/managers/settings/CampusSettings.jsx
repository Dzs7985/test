import { useEffect, useRef, useState } from 'react';

const CheckIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

/**
 * 校区区块：切换（下拉选择）与增删改合并到同一个下拉面板，避免校区名在页面上重复出现两处。
 * 面板内含「新增校区」输入行 + 校区列表，列表项可点击切换，右侧带「修改 / 删除」。
 */
export default function CampusSettings({ campus }) {
  const [newCampus, setNewCampus] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef(null);
  const menuRef = useRef(null);
  const scrollIndexRef = useRef(0);

  const { campusEditor } = campus;

  const closePicker = () => {
    setPickerOpen(false);
    campusEditor.cancel();
  };

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const handleDocClick = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        closePicker();
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, [pickerOpen, campusEditor]);

  // CSS scroll-snap 在鼠标滚轮下单次位移过大、会跳过多项，因此用 JS 精确控制：每次滚轮只前进/后退一项。
  useEffect(() => {
    if (!pickerOpen) return undefined;
    const menu = menuRef.current;
    if (!menu) return undefined;

    const firstItem = menu.querySelector('li');
    const itemHeight = firstItem ? firstItem.getBoundingClientRect().height : 44;

    scrollIndexRef.current = 0;
    menu.scrollTop = 0;

    // 平滑滚动期间忽略后续滚轮事件，避免一次滚动连续跳多项
    let lockUntil = 0;

    const handleWheel = (event) => {
      const maxIndex = Math.round((menu.scrollHeight - menu.clientHeight) / itemHeight);
      if (maxIndex <= 0) return;

      event.preventDefault();

      const now = Date.now();
      if (now < lockUntil) return;
      lockUntil = now + 150;

      const direction = event.deltaY > 0 ? 1 : -1;
      scrollIndexRef.current = Math.min(Math.max(scrollIndexRef.current + direction, 0), maxIndex);
      menu.scrollTo({ top: scrollIndexRef.current * itemHeight, behavior: 'smooth' });
    };

    menu.addEventListener('wheel', handleWheel, { passive: false });
    return () => menu.removeEventListener('wheel', handleWheel);
  }, [pickerOpen]);

  const handleAdd = async () => {
    const ok = await campus.addCampus(newCampus);
    if (ok) setNewCampus('');
  };

  const pickCampus = (value) => {
    campus.setSelectedCampus(value);
    closePicker();
  };

  const startEdit = (index, item) => campusEditor.start(index, item);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
      }}
    >
      <div className="campus-current-title">当前校区</div>
      <div className="campus-picker" ref={pickerRef}>
        <button
          type="button"
          className="campus-picker-trigger"
          onClick={() => (pickerOpen ? closePicker() : setPickerOpen(true))}
          aria-haspopup="listbox"
          aria-expanded={pickerOpen}
        >
          <span className="campus-picker-label">{campus.selectedCampus || '未选择'}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {pickerOpen ? (
          <div className="campus-picker-panel">
            <div className="campus-picker-add">
              <input
                value={newCampus}
                onChange={(event) => setNewCampus(event.target.value)}
                placeholder="新增校区"
              />
              <button type="button" className="primary-btn" onClick={handleAdd}>
                添加
              </button>
            </div>

            <ul className="campus-picker-menu" role="listbox" ref={menuRef}>
              {campus.campuses.map((item, index) => (
                <li key={item}>
                  {campusEditor.index === index ? (
                    <>
                      <input
                        className="mini-edit"
                        value={campusEditor.value}
                        onChange={(event) => campusEditor.change(event.target.value)}
                        aria-label={`重命名校区 ${item}`}
                      />
                      <button type="button" className="mini-action" onClick={campus.saveCampusEdit}>
                        保存
                      </button>
                      <button type="button" className="mini-action" onClick={campusEditor.cancel}>
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={'campus-picker-item ' + (item === campus.selectedCampus ? 'is-selected' : '')}
                        onClick={() => pickCampus(item)}
                      >
                        <span>{item}</span>
                        {item === campus.selectedCampus ? <CheckIcon /> : null}
                      </button>
                      <button
                        type="button"
                        className="mini-action"
                        onClick={() => startEdit(index, item)}
                      >
                        修改
                      </button>
                      <button
                        type="button"
                        className="mini-action is-danger"
                        onClick={() => campus.deleteCampus(item)}
                      >
                        删除
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}