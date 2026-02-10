import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, LogOut, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import './Auth.css'

const API_URL = 'http://localhost:3000'

interface Document {
  id: string
  title: string
  ownerId: number
  ownerName: string
  ownerAvatar?: string
  createdAt: string
  updatedAt: string
}

export default function DocumentList() {
  const navigate = useNavigate()
  const { user, logout, token } = useAuth()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState('')

  useEffect(() => {
    if (token) {
      fetchDocuments()
    } else {
      setLoading(false)
    }
  }, [token])

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/api/documents`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setDocuments(data.documents)
      } else if (response.status === 401) {
        logout()
        navigate('/login')
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDocument = async () => {
    if (!token) {
      navigate('/login')
      return
    }

    const title = newDocTitle.trim() || 'Untitled Document'

    try {
      const response = await fetch(`${API_URL}/api/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title })
      })

      if (response.ok) {
        const data = await response.json()
        setShowModal(false)
        setNewDocTitle('')
        navigate(`/editor/${data.document.id}`)
      }
    } catch (error) {
      console.error('Error creating document:', error)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="document-list-container">
      <div className="document-list-header">
        <h1>我的文档</h1>
        <div className="user-info">
          {user?.avatar && (
            <img src={user.avatar} alt={user.username} className="user-avatar" />
          )}
          <span className="user-name">{user?.username || 'Guest'}</span>
          <button className="new-doc-btn" onClick={() => setShowModal(true)}>
            <Plus size={18} />
            新建文档
          </button>
          {user && (
            <button className="logout-btn" onClick={handleLogout}>
              <LogOut size={16} />
              退出
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading-state">
          <p>加载中...</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="empty-state">
          <FileText size={64} />
          <h3>还没有文档</h3>
          <p>点击"新建文档"开始创建您的第一个文档</p>
        </div>
      ) : (
        <div className="documents-grid">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="document-card"
              onClick={() => navigate(`/editor/${doc.id}`)}
            >
              <div className="document-icon">
                <FileText size={24} />
              </div>
              <h3 className="document-title">{doc.title}</h3>
              <p className="document-meta">
                更新于 {formatDate(doc.updatedAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 新建文档弹窗 */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>新建文档</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder="请输入文档名称"
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateDocument()}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowModal(false)}>
                取消
              </button>
              <button className="btn-primary" onClick={handleCreateDocument}>
                创建
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
