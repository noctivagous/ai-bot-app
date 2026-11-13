// Drawn scrollbar for the main region (FEATURE-MAP R8).
//
// The pattern proven in introduction.html, ported to React: .main's
// native bar is hidden (CSS) and this overlay track + thumb — a drawn
// element driven by the region's scroll position — is shown whenever
// the region overflows, on every platform, with no overlay
// auto-hiding. Thumb height is the visible fraction (min 28px);
// dragging the thumb, clicking the track (jump, centred on the click)
// and wheeling over the bar all scroll the region.
//
// All state lives in the DOM (styles/classes set imperatively from a
// rAF-throttled layout pass) so scrolling never re-renders React.
// Sync triggers: the region's scroll events, a ResizeObserver on the
// region, a MutationObserver on its content (views swap wholesale),
// and window resize. Other scroll regions keep their styled native
// bars — this component is bound to .main only, via ref.

import { useEffect, useRef, type RefObject } from 'react';

export function DrawnScrollbar({ targetRef }: { targetRef: RefObject<HTMLElement | null> }) {
  const barRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = targetRef.current;
    const bar = barRef.current;
    const thumb = thumbRef.current;
    if (!el || !bar || !thumb) return;

    const metrics = () => {
      const range = el.scrollHeight - el.clientHeight;
      return { range, over: range > 1 };
    };

    const layout = () => {
      const { range, over } = metrics();
      bar.style.display = over ? 'block' : 'none';
      if (!over) return;
      // The bar spans the region's full height (top/bottom 0 of the
      // wrap), so the track height is the region's client height.
      const trackH = el.clientHeight;
      const thumbH = Math.max(28, (el.clientHeight / el.scrollHeight) * trackH);
      thumb.style.height = `${thumbH}px`;
      thumb.style.transform = `translateY(${(el.scrollTop / range) * (trackH - thumbH)}px)`;
    };

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(layout);
    };
    layout();
    el.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    const mo = new MutationObserver(schedule);
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);

    // Drag the thumb (pointer capture); click the track to jump.
    let drag: { y: number; top: number } | null = null;
    const onThumbDown = (e: PointerEvent) => {
      drag = { y: e.clientY, top: el.scrollTop };
      bar.classList.add('dragging');
      thumb.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onThumbMove = (e: PointerEvent) => {
      if (!drag) return;
      const { range } = metrics();
      const trackRange = el.clientHeight - thumb.offsetHeight;
      if (trackRange <= 0) return;
      el.scrollTop = drag.top + ((e.clientY - drag.y) / trackRange) * range;
    };
    const endDrag = () => {
      drag = null;
      bar.classList.remove('dragging');
    };
    const onBarDown = (e: PointerEvent) => {
      if (e.target === thumb) return;
      const { range } = metrics();
      const r = bar.getBoundingClientRect();
      const ratio = Math.max(
        0,
        Math.min(1, (e.clientY - r.top - thumb.offsetHeight / 2) / (r.height - thumb.offsetHeight)),
      );
      el.scrollTop = ratio * range;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      el.scrollTop += e.deltaY;
    };
    thumb.addEventListener('pointerdown', onThumbDown);
    thumb.addEventListener('pointermove', onThumbMove);
    thumb.addEventListener('pointerup', endDrag);
    thumb.addEventListener('pointercancel', endDrag);
    bar.addEventListener('pointerdown', onBarDown);
    bar.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', schedule);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener('resize', schedule);
      thumb.removeEventListener('pointerdown', onThumbDown);
      thumb.removeEventListener('pointermove', onThumbMove);
      thumb.removeEventListener('pointerup', endDrag);
      thumb.removeEventListener('pointercancel', endDrag);
      bar.removeEventListener('pointerdown', onBarDown);
      bar.removeEventListener('wheel', onWheel);
    };
  }, [targetRef]);

  return (
    <div className="drawn-bar" ref={barRef} data-testid="main-drawn-bar" aria-hidden="true">
      <div className="drawn-thumb" ref={thumbRef} data-testid="main-drawn-thumb" />
    </div>
  );
}
