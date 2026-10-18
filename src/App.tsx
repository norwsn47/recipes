import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { AppShell } from './auth/AppShell'
import { RecipeForm } from './recipes/RecipeForm'
import { RecipeList } from './recipes/RecipeList'
import { RecipeView } from './recipes/RecipeView'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<RecipeList />} />
            <Route path="recipes/new" element={<RecipeForm />} />
            <Route path="recipes/:id" element={<RecipeView />} />
            <Route path="recipes/:id/edit" element={<RecipeForm />} />
            <Route path="*" element={<RecipeList />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
