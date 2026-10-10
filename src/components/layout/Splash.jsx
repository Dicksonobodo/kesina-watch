import { motion } from "motion/react";
import { LogoMark } from "@/components/ui/Logo";

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <motion.div
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <LogoMark className="size-12" />
      </motion.div>
    </div>
  );
}
