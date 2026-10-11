import { cn } from './cn.js'

// The border uses --input (3:1 on white) so the field edge is visible outdoors.
const field =
  'block w-full rounded-lg border border-input bg-background px-3 text-base text-foreground ' +
  'placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-ring disabled:opacity-40 aria-[invalid=true]:border-destructive'

export function Input({ className, ...props }) {
  return <input className={cn(field, 'min-h-11', className)} {...props} />
}

export function Textarea({ className, rows = 4, ...props }) {
  return <textarea rows={rows} className={cn(field, 'py-2', className)} {...props} />
}
