import type { Transition, Variants } from "framer-motion";

export const calm = [0.16, 1, 0.3, 1] as const;
export const soft = [0.4, 0, 0.2, 1] as const;

export const transition = {
  page: { duration: 0.7, ease: calm } satisfies Transition,
  enter: { duration: 0.55, ease: calm } satisfies Transition,
  hover: { duration: 0.35, ease: soft } satisfies Transition,
  micro: { duration: 0.2, ease: soft } satisfies Transition,
};

export const fadeUp: Variants = {
  initial: { opacity: 0, y: 16 },
  enter: { opacity: 1, y: 0, transition: transition.enter },
  exit: { opacity: 0, y: -8, transition: { duration: 0.3, ease: calm } },
};

export const fade: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: transition.enter },
  exit: { opacity: 0, transition: { duration: 0.25, ease: calm } },
};

export const stagger = (delay = 0.06): Variants => ({
  initial: {},
  enter: {
    transition: { staggerChildren: delay, delayChildren: 0.06 },
  },
});
