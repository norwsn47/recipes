import { SectionLabel } from '@outbuild/design-system'

export const Default = () => <SectionLabel>Past rounds</SectionLabel>

export const AboveContent = () => (
  <div style={{ width: 320 }}>
    <SectionLabel>This week</SectionLabel>
    <p style={{ margin: '8px 0 0' }}>Three rounds played, one new best.</p>
  </div>
)
