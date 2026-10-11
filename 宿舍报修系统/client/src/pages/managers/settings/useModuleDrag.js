import { useEffect, useRef } from 'react';

/** 长按启动时长：按住约 0.24 秒才开始拖拽，与「点行选中」互不干扰 */
const HOLD_MS = 240;
/** 长按等待期间的指针抖动容差：超过即判定为拖拽意图、立即启动拖拽；未超过则继续等待长按计时 */
const MOVE_TOL = 8;

/** 指针落在哪个槽位：越过相邻两行中心的中点才换位，上下对称、不会来回跳 */
const slotIndexAt = (centers, pointer) => {
  const last = centers.length - 1;
  if (last < 0) return -1;
  let index = 0;
  for (let i = 0; i < last; i += 1) {
    if (pointer <= (centers[i] + centers[i + 1]) / 2) break;
    index = i + 1;
  }
  return index;
};

/** 松手后浏览器仍会补发一次 click（会误触「点行选中」）：capture 阶段拦掉一次 */
const suppressNextClick = () => {
  const block = (event) => {
    event.stopPropagation();
    event.preventDefault();
    document.removeEventListener('click', block, true);
  };
  document.addEventListener('click', block, true);
  window.setTimeout(() => document.removeEventListener('click', block, true), 400);
};

/**
 * 模块列表拖拽排序（长按启动、松手即完成）。
 * - 拖拽期间不触发任何 React 更新：被拖行逐帧直接写 inline transform 跟手，
 *   其余行改一行 translateY(±行距)，由 CSS transition 平滑让位；
 * - 指针监听挂在 document 上：指针横向偏移、移出拖拽柄都不会中断拖拽；
 * - 落点在「同一启用状态」的段内夹紧：未启用的模块固定沉底、拖不出列表上下边界；
 * - 松手时才对真实 DOM 做一次 insertBefore 重排，并按 id 全量顺序提交（避免索引竞态）。
 * modules：当前模块数组（顺序即展示顺序）；listRef / rowRefs：列表与各行的元素引用；
 * onReorder(orderedIds)：松手且顺序有变化时调用（异步落盘，失败提示由上游负责）。
 */
export function useModuleDrag({ modules, listRef, rowRefs, onReorder }) {
  const sessionRef = useRef(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const modulesRef = useRef(modules);
  modulesRef.current = modules;

  /** 撤掉文档级监听与残留视觉：取消、卸载、异常兜底都走这里（被拖行与让位行平滑滑回原位） */
  const teardown = () => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    window.clearTimeout(session.holdTimer);
    window.cancelAnimationFrame(session.raf);
    document.removeEventListener('pointermove', session.onMove);
    document.removeEventListener('pointerup', session.onUp);
    document.removeEventListener('pointercancel', session.onCancel);
    if (session.listEl) session.listEl.classList.remove('is-drag-active');
    session.ids.forEach((id) => {
      if (id === session.id) return;
      const rowEl = rowRefs.current.get(id);
      if (rowEl) rowEl.style.transform = '';
    });
    if (session.el) {
      session.el.classList.remove('is-holding', 'is-dragging');
      session.el.style.transform = '';
    }
  };

  /** 由「长按计时到点」或「拖拽柄上按下」进入真正的拖拽：一次性测量布局并算出允许区间 */
  const startDrag = (session) => {
    if (sessionRef.current !== session || session.phase !== 'press') return;
    window.clearTimeout(session.holdTimer);
    session.holdTimer = 0;
    const ids = modulesRef.current.map((item) => item.id);
    const orig = ids.indexOf(session.id);
    if (ids.length < 2 || orig === -1) {
      teardown();
      return;
    }
    const tops = [];
    const centers = [];
    ids.forEach((id) => {
      const rowEl = rowRefs.current.get(id);
      tops.push(rowEl ? rowEl.offsetTop : 0);
      centers.push(rowEl ? rowEl.offsetTop + rowEl.offsetHeight / 2 : 0);
    });
    // 同一启用状态连成一段（启用在前、未启用沉底，服务端已归一化）：拖拽只允许在段内换位。
    // 未启用模块的段起点即启用模块个数，因此「未启用的只能在最下方」。
    const enabledCount = modulesRef.current.filter((item) => item.enabled).length;
    const enabled = Boolean(modulesRef.current[orig].enabled);
    session.phase = 'drag';
    session.ids = ids;
    session.tops = tops;
    session.centers = centers;
    session.pitch = tops[1] - tops[0];
    session.orig = orig;
    session.target = orig;
    session.allowedMin = enabled ? 0 : enabledCount;
    session.allowedMax = (enabled ? enabledCount : ids.length) - 1;
    session.grabOffset = session.pointerY - session.el.getBoundingClientRect().top;
    session.el.classList.remove('is-holding');
    session.el.classList.add('is-dragging');
    session.listEl.classList.add('is-drag-active');
  };

  /** 每帧只处理一次：被拖行顶部夹紧在允许区间内跟手；跨过半格才更新目标槽位并让其余行让位 */
  const runFrame = () => {
    const session = sessionRef.current;
    if (!session || session.phase !== 'drag') return;
    session.raf = 0;
    const pointer = session.pointerY - session.listEl.getBoundingClientRect().top;
    const rawTop = pointer - session.grabOffset;
    const minTop = session.tops[session.allowedMin];
    const maxTop = session.tops[session.allowedMax];
    const clampedTop = Math.min(Math.max(rawTop, minTop), maxTop);
    session.el.style.transform = `translateY(${clampedTop - session.tops[session.orig]}px)`;
    const target = Math.min(
      Math.max(slotIndexAt(session.centers, clampedTop + session.grabOffset), session.allowedMin),
      session.allowedMax,
    );
    if (target === session.target) return;
    session.target = target;
    session.ids.forEach((id, index) => {
      if (id === session.id) return;
      const rowEl = rowRefs.current.get(id);
      if (!rowEl) return;
      let dy = 0;
      if (session.orig < target && index > session.orig && index <= target) dy = -session.pitch;
      if (session.orig > target && index >= target && index < session.orig) dy = session.pitch;
      rowEl.style.transform = dy ? `translateY(${dy}px)` : '';
    });
  };

  /** 松手落位：重排真实 DOM 后，被拖行从指针处平滑滑进目标槽位，并提交新顺序 */
  const finishDrag = (session) => {
    sessionRef.current = null;
    window.clearTimeout(session.holdTimer);
    window.cancelAnimationFrame(session.raf);
    document.removeEventListener('pointermove', session.onMove);
    document.removeEventListener('pointerup', session.onUp);
    document.removeEventListener('pointercancel', session.onCancel);
    const { el, listEl, ids, orig, target } = session;
    listEl.classList.remove('is-drag-active');
    const changed = target !== orig;
    let nextIds = null;
    if (changed) {
      nextIds = [...ids];
      nextIds.splice(orig, 1);
      nextIds.splice(target, 0, session.id);
    }
    // 同一同步块内完成「记录视觉位置 → 清偏移 → 重排 DOM → 拉回视觉位置」，
    // 浏览器只会渲染最终态，松手瞬间不会闪跳
    const beforeTop = el.getBoundingClientRect().top;
    el.style.transform = '';
    ids.forEach((id) => {
      if (id === session.id) return;
      const rowEl = rowRefs.current.get(id);
      if (rowEl) rowEl.style.transform = '';
    });
    let dy = 0;
    if (changed) {
      const anchorEl = nextIds[target + 1] ? rowRefs.current.get(nextIds[target + 1]) : null;
      if (anchorEl) listEl.insertBefore(el, anchorEl);
      else listEl.appendChild(el);
      dy = beforeTop - el.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) el.style.transform = `translateY(${dy}px)`;
      void el.offsetHeight; // 强制提交动画起点，收束过渡才能从指针处滑起
    }
    el.classList.remove('is-dragging'); // 恢复 transform 过渡
    el.style.transform = '';
    suppressNextClick();
    if (changed) onReorderRef.current(nextIds);
  };

  /** 行上按下：拖拽柄立即启动（保持拖动柄的手感），行其他位置长按 0.24 秒后启动 */
  const handlePointerDown = (event, id, editing) => {
    if (editing || event.button !== 0 || sessionRef.current) return;
    // 仅排除行末开关（input/label）：长按行内任意其他位置（含模块名）都可以拖动；
    // 短按仍是「点行选中」，由松手时的一次性 click 拦截区分
    if (event.target.closest('input, label')) return;
    const el = rowRefs.current.get(id);
    const listEl = listRef.current;
    if (!el || !listEl) return;
    const fromHandle = Boolean(event.target.closest('.drag-handle'));
    const session = {
      id,
      el,
      listEl,
      phase: 'press',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pointerY: event.clientY,
      raf: 0,
      holdTimer: 0,
      ids: [],
      tops: [],
      centers: [],
      pitch: 0,
      orig: 0,
      target: 0,
      allowedMin: 0,
      allowedMax: 0,
      grabOffset: 0,
      onMove: null,
      onUp: null,
      onCancel: null,
    };
    session.onMove = (moveEvent) => {
      if (moveEvent.pointerId !== session.pointerId) return;
      if (session.phase === 'press') {
        const drift = Math.max(
          Math.abs(moveEvent.clientX - session.startX),
          Math.abs(moveEvent.clientY - session.startY),
        );
        if (drift <= MOVE_TOL) return;
        // 漂移超过容差：拖动意图成立，立即进入拖拽（长按计时到点同样会启动）
        startDrag(session);
        if (session.phase !== 'drag') return; // 启动失败（如可拖行不足）已就地取消
      }
      moveEvent.preventDefault();
      session.pointerY = moveEvent.clientY;
      if (!session.raf) session.raf = window.requestAnimationFrame(runFrame);
    };
    session.onUp = (upEvent) => {
      if (upEvent.pointerId !== session.pointerId) return;
      if (session.phase === 'press') teardown();
      else finishDrag(session);
    };
    session.onCancel = (cancelEvent) => {
      if (cancelEvent.pointerId !== session.pointerId) return;
      teardown();
    };
    sessionRef.current = session;
    document.addEventListener('pointermove', session.onMove, { passive: false });
    document.addEventListener('pointerup', session.onUp);
    document.addEventListener('pointercancel', session.onCancel);
    if (fromHandle) {
      startDrag(session);
    } else {
      el.classList.add('is-holding');
      session.holdTimer = window.setTimeout(() => startDrag(session), HOLD_MS);
    }
  };

  useEffect(() => () => teardown(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { handlePointerDown };
}