import { Card, CardTitle, Badge } from '@outbuild/design-system'

export const Default = () => (
  <div style={{ width: 340 }}>
    <Card>
      <CardTitle>Bruntsfield, 18 September</CardTitle>
      <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>Flat card: a thin border, no shadow.</p>
    </Card>
  </div>
)

export const WithBadge = () => (
  <div style={{ width: 340 }}>
    <Card>
      <CardTitle>Your best round</CardTitle>
      <p style={{ margin: '0 0 12px' }}>38 strokes on 18 holes.</p>
      <Badge variant="highlight">New</Badge>
    </Card>
  </div>
)
