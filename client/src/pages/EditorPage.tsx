import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Edit2, Check, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Editor from '../Editor'
import './EditorPage.css'

const API_URL = 'http://localhost:3000'

export default function EditorPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const { user, token } = useAuth()
  const [docTitle, setDocTitle] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')

  const userName = user?.username || `Guest ${Math.floor(Math.random() * 1000)}`

  useEffect(() => {
    if (token && docId) {
      fetchDocument()
    }
  }, [token, docId])

  const fetchDocument = async () => {
    try {
      const response = await fetch(`${API_URL}/api/documents/${docId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setDocTitle(data.document.title)
      }
    } catch (error) {
      console.error('Error fetching document:', error)
    }
  }

  const handleUpdateTitle = async () => {
    if (!token || !docId) return

    const newTitle = editTitle.trim()
    if (!newTitle || newTitle === docTitle) {
      setIsEditing(false)
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/documents/${docId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: newTitle })
      })

      if (response.ok) {
        setDocTitle(newTitle)
        setIsEditing(false)
      }
    } catch (error) {
      console.error('Error updating title:', error)
    }
  }

  const startEditing = () => {
    setEditTitle(docTitle)
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditTitle('')
  }

  if (!docId) {
    return <div>Document not found</div>
  }

  return (
    <div className="editor-page">
      <header className="editor-header">
        <div className="editor-header-left">
          <button className="back-btn" onClick={() => navigate('/documents')}>
            <ArrowLeft size={20} />
            返回
          </button>
          
          {isEditing ? (
            <div className="title-edit">
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleUpdateTitle()
                  if (e.key === 'Escape') cancelEditing()
                }}
                autoFocus
              />
              <button className="icon-btn save" onClick={handleUpdateTitle}>
                <Check size={16} />
              </button>
              <button className="icon-btn cancel" onClick={cancelEditing}>
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="title-display">
              <h1>{docTitle || 'Untitled Document'}</h1>
              {token && (
                <button className="icon-btn edit" onClick={startEditing}>
                  <Edit2 size={16} />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="editor-header-right">
          {user?.avatar && (
            <img src={user.avatar} alt={user.username} className="user-avatar-small" />
          )}
          <span className="user-name">{user?.username || 'Guest'}</span>
        </div>
      </header>
      <main className="editor-main">
        <Editor roomId={docId} userName={userName} />
      </main>
    </div>
  )
}
