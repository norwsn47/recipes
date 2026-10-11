// Minimal Worker entry. No auth yet (gated; see PRD). Only /api/health is public.

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname === '/api/health') {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }, 405)
        }
        return json({ ok: true })
      }
      return json({ error: { code: 'not_found', message: 'Not found' } }, 404)
    } catch (err) {
      console.error('Unhandled worker error', err instanceof Error ? err.message : 'unknown')
      return json({ error: { code: 'internal', message: 'Something went wrong' } }, 500)
    }
  },
} satisfies ExportedHandler
