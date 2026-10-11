import { cn } from './cn.js'

// One primary button per screen. Green is the only interactive colour.
// Touch target is at least 44px tall (min-h-11).
const base =
  'inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-lg font-semibold text-base ' +
  'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ' +
  'disabled:opacity-40 disabled:pointer-events-none'

const variants = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
  secondary: 'border border-input bg-background text-foreground hover:bg-accent active:bg-accent',
  ghost: 'text-primary hover:bg-accent active:bg-accent',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
}

const sizes = {
  md: '',
  lg: 'min-h-12 px-6 text-lg',
}

export function Button({ variant = 'primary', size = 'md', full = false, className, type = 'button', ...props }) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], full && 'w-full', className)}
      {...props}
    />
  )
}
