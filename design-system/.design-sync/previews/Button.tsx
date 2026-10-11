import { Button } from '@outbuild/design-system'

const row = { display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'center' }

export const Primary = () => <Button>Start the round</Button>

export const Variants = () => (
  <div style={row}>
    <Button>Start the round</Button>
    <Button variant="secondary">Past rounds</Button>
    <Button variant="ghost">Skip for now</Button>
    <Button variant="destructive">Delete round</Button>
  </div>
)

export const Large = () => (
  <div style={{ width: 320 }}>
    <Button size="lg" full>Send my sign-in link</Button>
  </div>
)

export const Disabled = () => (
  <div style={row}>
    <Button disabled>Save round</Button>
    <Button variant="secondary" disabled>Past rounds</Button>
  </div>
)
