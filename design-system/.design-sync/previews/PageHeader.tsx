import { PageHeader, Button } from '@outbuild/design-system'

export const Default = () => (
  <div style={{ width: 380 }}>
    <PageHeader
      title="Past rounds"
      back={<Button variant="ghost">{'← Home'}</Button>}
      right={<Button variant="ghost">+ Add</Button>}
    />
  </div>
)

export const LongTitle = () => (
  <div style={{ width: 380 }}>
    <PageHeader
      title="Bruntsfield Short Hole Golf Course, 18 September round"
      back={<Button variant="ghost">{'← Home'}</Button>}
      right={<Button variant="ghost">Edit</Button>}
    />
  </div>
)
