import { Field, Input, Textarea } from '@outbuild/design-system'

const box = { width: 320 }

export const WithHint = () => (
  <div style={box}>
    <Field label="Player name" hint="Shown on the scorecard.">
      <Input placeholder="Who is playing?" />
    </Field>
  </div>
)

export const WithError = () => (
  <div style={box}>
    <Field label="Email address" error="That does not look right - try again.">
      <Input defaultValue="alex@" />
    </Field>
  </div>
)

export const MultiLine = () => (
  <div style={box}>
    <Field label="Notes" hint="Optional.">
      <Textarea defaultValue="Wind picked up on the back nine." />
    </Field>
  </div>
)
