import { useState } from 'react';

/**
 * 模块地点选项的列表编辑块（「模块管理 → 地点设置」内使用）。
 * 逐条输入添加、行内改名、删除；批量的「一键生成」只保留在宿舍报修的楼号设置里。
 * onAdd / onRemove / onRename 由父组件提供（负责查重、二次确认、保存与提示），返回是否成功。
 * header 是标题下方的可选内容块（如按楼号细分时的楼号选择器）。
 */
export default function OptionListEditor({
  title,
  header,
  items,
  placeholder,
  emptyText = '暂无选项',
  onAdd,
  onRemove,
  onRename,
}) {
  const [draft, setDraft] = useState('');
  const [editIndex, setEditIndex] = useState(-1);
  const [editValue, setEditValue] = useState('');

  const cancelEdit = () => {
    setEditIndex(-1);
    setEditValue('');
  };

  const handleAdd = async () => {
    const value = draft.trim();
    if (!value) return;
    const ok = await onAdd([value]);
    if (ok) setDraft('');
  };

  const handleRenameSave = async () => {
    const ok = await onRename(items[editIndex], editValue);
    if (ok) cancelEdit();
  };

  return (
    <div className="option-block">
      <div className="option-block-title">{title}</div>
      {header}

      <div className="option-add">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleAdd();
            }
          }}
          placeholder={placeholder}
        />
        <button className="primary-btn" type="button" onClick={handleAdd}>
          添加
        </button>
      </div>

      <ul className="option-list">
        {items.length === 0 ? (
          <li className="empty">{emptyText}</li>
        ) : (
          items.map((item, index) => (
            <li key={item} className="option-row">
              {editIndex === index ? (
                <>
                  <input
                    className="mini-edit"
                    value={editValue}
                    onChange={(event) => setEditValue(event.target.value)}
                    aria-label={`重命名 ${item}`}
                  />
                  <button type="button" className="mini-action" onClick={handleRenameSave}>
                    保存
                  </button>
                  <button type="button" className="mini-action" onClick={cancelEdit}>
                    取消
                  </button>
                </>
              ) : (
                <>
                  <span className="option-label">{item}</span>
                  <button
                    type="button"
                    className="mini-action"
                    onClick={() => {
                      setEditIndex(index);
                      setEditValue(item);
                    }}
                  >
                    修改
                  </button>
                  <button type="button" className="mini-action is-danger" onClick={() => onRemove(item)}>
                    删除
                  </button>
                </>
              )}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}