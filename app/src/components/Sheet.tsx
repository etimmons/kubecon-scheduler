import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

interface Props {
  label: string;
  onClose: () => void;
  header: ComponentChildren;
  footer?: ComponentChildren;
  children: ComponentChildren;
  /** Changes when the content changes (e.g. prev/next), to reset the sheet's scroll. */
  contentKey?: string;
}

/**
 * A full-height panel over the list. The list behind it stays mounted and keeps its
 * scroll position; the sheet scrolls on its own. Swipe down from the top to close.
 */
export function Sheet({ label, onClose, header, footer, children, contentKey }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; dy: number; active: boolean } | null>(null);

  useEffect(() => {
    body.current?.scrollTo(0, 0);
  }, [contentKey]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("sheet-open");
      prev?.focus?.({ preventScroll: true });
    };
  }, []);

  const onTouchStart = (e: TouchEvent) => {
    const atTop = (body.current?.scrollTop ?? 0) <= 0;
    drag.current = { y0: e.touches[0].clientY, dy: 0, active: atTop };
  };
  const onTouchMove = (e: TouchEvent) => {
    const d = drag.current;
    if (!d || !d.active || !panel.current) return;
    d.dy = Math.max(0, e.touches[0].clientY - d.y0);
    if (d.dy > 0) panel.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onTouchEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!panel.current) return;
    panel.current.style.transform = "";
    if (d && d.active && d.dy > 90) onClose();
  };

  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        ref={panel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div class="sheet-grab" aria-hidden="true" />
        <div class="sheet-head">{header}</div>
        <div class="sheet-body" ref={body}>
          {children}
        </div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}
