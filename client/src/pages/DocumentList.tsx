import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FileText, Trash2, LogOut, User } from 'lucide-react'
import { documentApi, authApi } from '../api'
import './DocumentList.css'

interface Document {
  id: string
  title: string
  created_at: string
  updated_at: string
  owner_name: string
}

interface User {
  id: number
  username: string
  email: string
}

export default function DocumentList() {
  const navigate = useNavigate()
  const [documents, setDocuments] = useState<Document[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [docsData, userData] = await Promise.all([
        documentApi.getAll(),
        authApi.getMe(),
      ])
      setDocuments(docsData.documents)
      setUser(userData.user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
      // 如果认证失败，跳转到登录页
      if (err instanceof Error && err.message.includes('token')) {
        handleLogout()
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDocument = async () => {
    setCreating(true)
    try {
      const data = await documentApi.create()
      navigate(`/doc/${data.document.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create document')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteDocument = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this document?')) {
      return
    }

    try {
      await documentApi.delete(id)
      setDocuments(documents.filter((doc) => doc.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete document')
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="document-list-container">
        <div className="loading">Loading...</div>
      </div>
    )
  }

  return (
    <div className="document-list-container">
      <header className="document-list-header">
        <div className="header-left">
          <h1>My Documents</h1>
          <span className="document-count">{documents.length} documents</span>
        </div>
        <div className="header-right">
          {user && (
            <div className="user-info">
              <User size={18} />
              <span>{user.username}</span>
            </div>
          )}
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div className="document-grid">
        <button
          className="create-document-card"
          onClick={handleCreateDocument}
          disabled={creating}
        >
          <Plus size={48} />
          <span>{creating ? 'Creating...' : 'New Document'}</span>
        </button>

        {documents.map((doc) => (
          <div
            key={doc.id}
            className="document-card"
            onClick={() => navigate(`/doc/${doc.id}`)}
          >
            <div className="document-icon">
              <FileText size={40} />
            </div>
            <div className="document-info">
              <h3 className="document-title">{doc.title}</h3>
              <p className="document-meta">
                Created: {formatDate(doc.created_at)}
              </p>
              <p className="document-meta">
                Updated: {formatDate(doc.updated_at)}
              </p>
            </div>
            <button
              className="delete-btn"
              onClick={(e) => handleDeleteDocument(doc.id, e)}
              title="Delete document"
            >
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>

      {documents.length === 0 && !loading && (
        <div className="empty-state">
          <FileText size={64} />
          <p>No documents yet</p>
          <p className="empty-hint">Create your first document to get started</p>
        </div>
      )}
    </div>
  )
}
