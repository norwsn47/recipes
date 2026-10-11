// Minimal Google Identity Services typing and loader. No npm package: the script is injected here.
interface CredentialResponse {
  credential?: string
}
interface GoogleId {
  initialize(config: { client_id: string; callback: (r: CredentialResponse) => void }): void
  renderButton(
    el: HTMLElement,
    options: { type?: 'standard'; theme?: 'outline'; size?: 'large'; text?: 'signin_with'; shape?: 'rectangular'; width?: number },
  ): void
}
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

const SRC = 'https://accounts.google.com/gsi/client'
let loading: Promise<GoogleId> | null = null

export function loadGoogle(): Promise<GoogleId> {
  if (window.google) return Promise.resolve(window.google.accounts.id)
  loading ??= new Promise<GoogleId>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    script.onload = () => (window.google ? resolve(window.google.accounts.id) : reject(new Error('no google')))
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('Google script failed to load'))
    }
    document.head.appendChild(script)
  })
  return loading
}

let initialisedWith: ((r: CredentialResponse) => void) | null = null
let currentHandler: (credential: string | undefined) => void = () => {}

/** Initialises once; later calls only swap which handler receives the credential. */
export function initGoogle(id: GoogleId, clientId: string, handler: (credential: string | undefined) => void): void {
  currentHandler = handler
  if (initialisedWith) return
  initialisedWith = (r) => currentHandler(r.credential)
  id.initialize({ client_id: clientId, callback: initialisedWith })
}
