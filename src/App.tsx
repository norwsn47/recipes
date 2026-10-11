import { BrowserRouter, Link, Route, Routes, useParams } from 'react-router-dom'
import { OutbuildMark } from '@design-system/components'
import { AuthProvider } from './auth/AuthContext'
import { APP_NAME, AppShell } from './auth/AppShell'

// Placeholders: the recipe list and recipe page arrive with the recipe features.
function Home() {
  return (
    <section className="flex flex-col gap-4 pb-8">
      <p className="text-muted-foreground">Your recipes will appear here.</p>
      <Link to="/recipes/123" className="inline-flex min-h-11 items-center text-primary underline">Open a sample recipe link</Link>
      <OutbuildMark appName={APP_NAME} className="pt-6" />
    </section>
  )
}

function RecipePlaceholder() {
  const { id } = useParams()
  return (
    <section className="flex flex-col gap-4 pb-8">
      <p>Recipe {id}</p>
      <Link to="/" className="inline-flex min-h-11 items-center text-primary underline">Back to all recipes</Link>
    </section>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Home />} />
            <Route path="recipes/:id" element={<RecipePlaceholder />} />
            <Route path="*" element={<Home />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
