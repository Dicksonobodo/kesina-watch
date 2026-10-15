import { useEffect, useState } from "react";

/*
 * The part of the screen you can actually see. When the keyboard opens, Safari (and some other
 * phone browsers) shrink the visible area and slide the page up instead of resizing it, which
 * leaves a full-height chat with its message box hidden behind or far from the keyboard. Sizing
 * the chat to this visible area keeps the message box sitting right on top of the keyboard.
 * Returns null on bigger screens, where the chat is a small window and none of this applies.
 */
export function useVisualViewport(active) {
  const [box, setBox] = useState(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv || !window.matchMedia("(max-width: 1023px)").matches) {
      setBox(null);
      return;
    }
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBox({ height: Math.round(vv.height), top: Math.round(vv.offsetTop) }));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return box;
}
