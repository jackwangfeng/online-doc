import { useState } from 'react'
import { X, Send } from 'lucide-react'
import './CommentSidebar.css'

export interface CommentData {
  id: string
  text: string
  author: string
  createdAt: number
  resolved?: boolean
}

interface CommentSidebarProps {
  comments: CommentData[]
  activeCommentId: string | null
  userName: string
  onAddComment: (commentId: string, text: string) => void
  onDeleteComment: (commentId: string) => void
  onCommentClick: (commentId: string) => void
}

export default function CommentSidebar({
  comments,
  activeCommentId,
  onAddComment,
  onDeleteComment,
  onCommentClick,
}: CommentSidebarProps) {
  const [newCommentText, setNewCommentText] = useState<Record<string, string>>({})

  const handleSubmit = (commentId: string) => {
    const text = newCommentText[commentId]?.trim()
    if (text) {
      onAddComment(commentId, text)
      setNewCommentText((prev) => ({ ...prev, [commentId]: '' }))
    }
  }

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (comments.length === 0) {
    return (
      <div className="comment-sidebar">
        <div className="comment-sidebar-empty">
          Select text and click the comment button to add a comment
        </div>
      </div>
    )
  }

  return (
    <div className="comment-sidebar">
      <div className="comment-sidebar-header">
        <h3>Comments ({comments.length})</h3>
      </div>
      <div className="comment-list">
        {comments.map((comment) => (
          <div
            key={comment.id}
            className={`comment-card ${activeCommentId === comment.id ? 'active' : ''}`}
            onClick={() => onCommentClick(comment.id)}
          >
            <div className="comment-header">
              <span className="comment-author">{comment.author}</span>
              <span className="comment-time">{formatTime(comment.createdAt)}</span>
              <button
                className="comment-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteComment(comment.id)
                }}
                title="Delete comment"
              >
                <X size={14} />
              </button>
            </div>
            <div className="comment-text">{comment.text}</div>
            <div className="comment-input-wrapper">
              <input
                type="text"
                placeholder="Reply..."
                value={newCommentText[comment.id] || ''}
                onChange={(e) =>
                  setNewCommentText((prev) => ({
                    ...prev,
                    [comment.id]: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSubmit(comment.id)
                  }
                }}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                className="comment-submit"
                onClick={(e) => {
                  e.stopPropagation()
                  handleSubmit(comment.id)
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
