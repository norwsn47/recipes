import { Banner } from '@outbuild/design-system'

const stack = { display: 'flex', flexDirection: 'column' as const, gap: 12, width: 380 }

export const Tones = () => (
  <div style={stack}>
    <Banner>Your round is saved.</Banner>
    <Banner tone="highlight">Signal is patchy - we will keep trying.</Banner>
    <Banner tone="error">Could not save. Check your connection.</Banner>
  </div>
)

export const Info = () => (
  <div style={{ width: 380 }}><Banner>Check your email for a sign-in link.</Banner></div>
)
