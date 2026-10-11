import { Textarea } from '@outbuild/design-system'

export const Default = () => (
  <div style={{ width: 320 }}><Textarea placeholder="Anything worth remembering about the round?" aria-label="Notes" /></div>
)

export const WithText = () => (
  <div style={{ width: 320 }}>
    <Textarea aria-label="Notes" defaultValue={'Wind picked up on the back nine.\nHole 6 was the best of the day.'} />
  </div>
)
