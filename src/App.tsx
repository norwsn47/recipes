import { useEffect, useState } from 'react'
import { Banner, Card, CardTitle, OutbuildMark } from '@design-system/components'

type ApiStatus = 'checking' | 'ok' | 'down'

export default function App() {
  const [status, setStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal })
      .then((res) => setStatus(res.ok ? 'ok' : 'down'))
      .catch((err: unknown) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) setStatus('down')
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 pb-8">
      <h1 className="sr-only">Family Recipes</h1>
      <OutbuildMark appName="Family Recipes" className="pt-6" />
      <Card>
        <CardTitle>Setup complete</CardTitle>
        <p className="text-muted-foreground">Features are coming soon.</p>
      </Card>
      {status === 'checking' && <Banner tone="info">Checking the API...</Banner>}
      {status === 'ok' && <Banner tone="info">API reachable</Banner>}
      {status === 'down' && <Banner tone="error">API not reachable</Banner>}
    </main>
  )
}
