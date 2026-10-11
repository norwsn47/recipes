import { cloneElement, useId } from 'react'

// Wraps one Input/Textarea with a visible label, optional hint and error.
// Wires up htmlFor, aria-describedby and aria-invalid so the field is labelled for screen readers.
export function Field({ label, hint, error, children }) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-foreground">
        {label}
      </label>
      {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

// Small uppercase annotation label (the "micro" typographic register).
export function SectionLabel({ className, ...props }) {
  return (
    <p
      className={['text-xs font-semibold uppercase tracking-wider text-muted-foreground', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  )
}
