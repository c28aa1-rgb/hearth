import type { Transition } from 'motion/react'

/** Hearth's motion vocabulary: calm and physical, no overshoot. */
export const spring: Transition = { type: 'spring', stiffness: 260, damping: 32, mass: 1 }
export const quick: Transition = { duration: 0.14, ease: [0.2, 0, 0, 1] }
export const standard: Transition = { duration: 0.28, ease: [0.2, 0, 0, 1] }
export const slow: Transition = { duration: 0.7, ease: [0.4, 0, 0.2, 1] }
export const exit: Transition = { duration: 0.2, ease: [0.3, 0, 1, 1] }
