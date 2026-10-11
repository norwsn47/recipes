import { cn } from './cn.js'

// Flat: a thin border, no shadow. Cards are for grouping, not decoration.
export function Card({ className, ...props }) {
  return <div className={cn('rounded-lg border border-border bg-card p-6 text-card-foreground', className)} {...props} />
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('mb-2', className)} {...props} />
}
