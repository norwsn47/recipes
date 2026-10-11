import { cn } from './cn.js'

// Pills use the full radius. "highlight" (orange) is for small highlights only, never for actions.
const variants = {
  neutral: 'bg-muted text-foreground',
  tint: 'bg-accent text-accent-foreground',
  brand: 'bg-primary text-primary-foreground',
  highlight: 'bg-highlight text-highlight-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
}

export function Badge({ variant = 'neutral', className, ...props }) {
  return (
    <span
      className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', variants[variant], className)}
      {...props}
    />
  )
}
