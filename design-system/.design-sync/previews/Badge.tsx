import { Badge } from '@outbuild/design-system'

const row = { display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }

export const Variants = () => (
  <div style={row}>
    <Badge>Neutral</Badge>
    <Badge variant="tint">Tint</Badge>
    <Badge variant="brand">Brand</Badge>
    <Badge variant="highlight">New</Badge>
    <Badge variant="destructive">Error</Badge>
  </div>
)

export const InLine = () => (
  <p style={{ margin: 0 }}>Round saved <Badge variant="tint">Synced</Badge></p>
)
