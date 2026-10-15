import { useEffect } from "react";

/*
 * While the chat or a chat game covers the whole screen on a phone, the page underneath must not
 * scroll (iPhones otherwise move the page behind when you swipe the messages). Bigger screens,
 * where the chat is a small window, are left alone.
 */
let locks = 0;
let saved = null;

export function useScrollLock(active) {
  useEffect(() => {
    if (!active || !window.matchMedia("(max-width: 1023px)").matches) return;
    if (locks++ === 0) {
      const y = window.scrollY;
      const b = document.body.style;
      saved = { y, position: b.position, top: b.top, left: b.left, right: b.right, overflow: b.overflow, width: b.width };
      Object.assign(b, { position: "fixed", top: `-${y}px`, left: "0", right: "0", width: "100%", overflow: "hidden" });
    }
    return () => {
      if (--locks === 0 && saved) {
        const { y, ...rest } = saved;
        Object.assign(document.body.style, rest);
        window.scrollTo(0, y);
        saved = null;
      }
    };
  }, [active]);
}
