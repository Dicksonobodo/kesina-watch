import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";

export function AnimatedNumber({ value, className }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: [0.22, 1, 0.36, 1] });
    return controls.stop;
  }, [mv, value]);

  return <motion.span className={className}>{text}</motion.span>;
}
