import { Link } from 'react-router-dom'

export function BackLink({ to = '/', children = 'All recipes' }: { to?: string; children?: string }) {
  return (
    <Link
      to={to}
      className="inline-flex min-h-11 items-center text-sm text-primary no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span aria-hidden="true">&larr;&nbsp;</span>{children}
    </Link>
  )
}
