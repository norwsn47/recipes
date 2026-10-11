// Three flex slots (back / title / right). The side slots never shrink below their content
// (min-w-max) and share any spare space equally, so a short title stays centred; a long
// title takes what is left and truncates, so it can never overlap a button.
export function PageHeader({ title, back, right }) {
  return (
    <header className="flex min-h-14 items-center gap-2">
      <div className="flex min-w-max flex-1 basis-0 justify-start">{back}</div>
      <h1 className="min-w-0 truncate px-1 text-center text-lg">{title}</h1>
      <div className="flex min-w-max flex-1 basis-0 justify-end">{right}</div>
    </header>
  )
}
