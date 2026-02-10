import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut } from 'lucide-react'
import Editor from '../Editor'
import { documentApi, authApi } from '../api'
import './EditorPage.css'

interface User {
  id: number
  username: string
  email: string
}

interface Document {
  id: string
  title: string
  owner_id: number
}

export default function EditorPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [document, setDocument] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    loadData()
  }, [documentId])

  const loadData = async () => {
    if (!documentId) {
      navigate('/documents')
      return
    }

    try {
      const [docData, userData] = await Promise.all([
        documentApi.getById(documentId),
        authApi.getMe(),
      ])
      setDocument(docData.document)
      setUser(userData.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load document')
      if (err instanceof Error && err.message.includes('token')) {
        handleLogout()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  if (loading) {
    return (
      <div className="editor-page">
        <div className="editor-loading">Loading document...</div>
      </div>
    )
  }

  if (error || !document || !user) {
    return (
      <div className="editor-page">
        <div className="editor-error">
          <p>{error || 'Document not found'}</p>
          <button onClick={() => navigate('/documents')}>
            Back to Documents
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-page">
      <header className="editor-page-header">
        <div className="header-left">
          <button
            className="back-btn"
            onClick={() => navigate('/documents')}
          >
            <ArrowLeft size={20} />
            Back
          </button>
          <div className="document-title-wrapper">
            <h1>{document.title}</h1>
            <span className="document-id">ID: {document.id}</span>
          </div>
        </div>
        <div className="header-right">
          <span className="user-name">{user.username}</span>
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      <main className="editor-page-content">
        <Editor roomId={document.id} userName={user.username} />
      </main>
    </div>
  )
}
