'use client'

import { ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  stepKey: string
  children: ReactNode
}

export default function ScreenTransition({ stepKey, children }: Props) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="w-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
