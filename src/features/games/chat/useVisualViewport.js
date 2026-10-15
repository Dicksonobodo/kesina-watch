import { useEffect, useLayoutEffect, useRef, useState } from "react";

/*
 * The part of the screen you can actually see. When the keyboard opens, Safari (and some other
 * phone browsers) shrink the visible area and slide the page up instead of resizing it, which
 * leaves a full-height chat with its message box hidden behind or far from the keyboard. Sizing
 * the chat to this visible area keeps the message box sitting right on top of the keyboard.
 *
 * Safari reports the keyboard in steps while it slides in, so the size is applied straight away
 * on every report (no waiting for the next frame, which showed a flash of the old layout) and is
 * re-checked a few times while the keyboard is opening or closing.
 * Returns null on bigger screens, where the chat is a small window and none of this applies.
 */
export function useVisualViewport(active) {
  const [box, setBox] = useState(null);
  const last = useRef("");
  const isPhone = () => window.matchMedia("(max-width: 1023px)").matches;

  // measure before the first paint, so the chat never shows at the wrong size
  useLayoutEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv || !isPhone()) return;
    setBox({ height: Math.round(vv.height), top: Math.round(vv.offsetTop) });
  }, [active]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv || !isPhone()) {
      setBox(null);
      last.current = "";
      return;
    }
    const update = () => {
      const next = { height: Math.round(vv.height), top: Math.round(vv.offsetTop) };
      const key = `${next.height}:${next.top}`;
      if (key === last.current) return;
      last.current = key;
      setBox(next);
    };
    const timers = [];
    // while the keyboard slides in or out, look again a few times
    const settle = () => {
      timers.splice(0).forEach(clearTimeout);
      for (const ms of [0, 50, 120, 250, 400, 650]) timers.push(setTimeout(update, ms));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    document.addEventListener("focusin", settle);
    document.addEventListener("focusout", settle);
    return () => {
      timers.forEach(clearTimeout);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.removeEventListener("focusin", settle);
      document.removeEventListener("focusout", settle);
    };
  }, [active]);
  return box;
}
