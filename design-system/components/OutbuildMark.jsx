// Every Outbuild app carries this on its home screen: the app name in heavy weight,
// then "by Outbuild" in regular weight and the muted colour, linking to outbuild.uk.
export function OutbuildMark({ appName, className }) {
  return (
    <p className={['flex items-baseline gap-2', className].filter(Boolean).join(' ')}>
      <span className="font-bold text-foreground">{appName}</span>
      <a
        href="https://outbuild.uk"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block py-3 -my-3 text-sm font-normal text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        by Outbuild <span aria-hidden="true">↗</span>
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </p>
  )
}
