import { cn } from './cn.js'

// A full-width status message. Errors use role="alert"; everything else role="status" (announced politely).
const tones = {
  info: 'bg-accent text-accent-foreground',
  highlight: 'bg-highlight text-highlight-foreground',
  error: 'bg-destructive text-destructive-foreground',
}

export function Banner({ tone = 'info', className, ...props }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-lg px-4 py-3 text-base font-semibold', tones[tone], className)}
      {...props}
    />
  )
}
