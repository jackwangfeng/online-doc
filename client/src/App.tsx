import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import Login from './pages/Login'
import DocumentList from './pages/DocumentList'
import EditorPage from './pages/EditorPage'
import './App.css'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/documents" element={<DocumentList />} />
          <Route path="/editor/:docId" element={<EditorPage />} />
          <Route path="/" element={<Navigate to="/documents" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
