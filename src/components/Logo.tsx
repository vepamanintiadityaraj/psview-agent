import { cn } from '@/lib/utils'

interface Props {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'text-base',
  md: 'text-lg',
  lg: 'text-xl',
}

export default function Logo({ size = 'md', className }: Props) {
  return (
    <span className={cn(sizes[size], 'font-semibold tracking-tight text-foreground select-none', className)}>
      PSView
    </span>
  )
}
