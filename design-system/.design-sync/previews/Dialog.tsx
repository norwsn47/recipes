import { Dialog, Button } from '@outbuild/design-system'

// A transform makes this box the containing block for the dialog's fixed overlay,
// so the open dialog renders inside the card instead of collapsing it.
const stage = { position: 'relative' as const, transform: 'translateZ(0)', width: 420, height: 340, overflow: 'hidden', border: '1px solid #d9d0c4' }

export const Confirm = () => (
  <div style={stage}>
    <Dialog open onClose={() => {}} title="Finish the round?">
      <p style={{ margin: '0 0 20px' }}>Scores are saved as you go, so nothing is lost.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Button full>See the scorecard</Button>
        <Button variant="secondary" full>Keep playing</Button>
      </div>
    </Dialog>
  </div>
)
