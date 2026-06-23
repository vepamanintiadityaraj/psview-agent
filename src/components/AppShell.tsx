'use client'

import { ReactNode } from 'react'

interface Props {
  children: ReactNode
}

export default function AppShell({ children }: Props) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {children}
    </div>
  )
}
