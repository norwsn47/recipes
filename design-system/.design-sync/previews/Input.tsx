import { Input } from '@outbuild/design-system'

const box = { width: 320 }

export const Default = () => (
  <div style={box}><Input placeholder="Who is playing?" /></div>
)

export const WithValue = () => (
  <div style={box}><Input defaultValue="Alex Morgan" aria-label="Player name" /></div>
)

export const Invalid = () => (
  <div style={box}><Input defaultValue="alex@" aria-label="Email address" aria-invalid="true" /></div>
)

export const Disabled = () => (
  <div style={box}><Input defaultValue="Bruntsfield" aria-label="Course" disabled /></div>
)
