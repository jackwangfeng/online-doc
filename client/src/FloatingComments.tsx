import { useEffect, useState, useRef, useCallback, memo } from 'react'
import { Check, MessageSquare, MoreVertical } from 'lucide-react'
import './FloatingComments.css'

export interface Comment {
  id: string
  content: string
  author: string
  createdAt: string
  resolved?: boolean
  from: number
  to: number
  selectedText: string
}

interface FloatingCommentsProps {
  comments: Comment[]
  activeCommentId: string | null
  editor: any
  onDeleteComment: (id: string) => void
  onResolveComment: (id: string) => void
  onCommentClick: (comment: Comment) => void
  pendingComment?: { from: number; to: number; selectedText: string } | null
  newCommentText?: string
  onNewCommentTextChange?: (text: string) => void
  onSubmitComment?: () => void
  onCancelComment?: () => void
}

// 评论框高度估算（用于重叠检测）
const COMMENT_BOX_HEIGHT = 100
const COMMENT_BOX_MARGIN = 8

// 单个评论组件
const CommentBox = memo(({
  comment,
  isActive,
  top,
  onDelete,
  onResolve,
  onClick
}: {
  comment: Comment
  isActive: boolean
  top: number
  onDelete: (id: string) => void
  onResolve: (id: string) => void
  onClick: (comment: Comment) => void
}) => {
  const [showMenu, setShowMenu] = useState(false)

  return (
    <div
      className={`floating-comment-box ${isActive ? 'active' : ''} ${comment.resolved ? 'resolved' : ''}`}
      style={{ top: `${top}px` }}
      onClick={() => onClick(comment)}
    >
      <div className="floating-comment-header">
        <div className="floating-comment-avatar">
          {comment.author.charAt(0).toUpperCase()}
        </div>
        <div className="floating-comment-meta">
          <span className="floating-comment-author">{comment.author}</span>
          <span className="floating-comment-time">
            {new Date(comment.createdAt).toLocaleDateString()}
          </span>
        </div>
        <div className="floating-comment-actions-simple">
          {comment.resolved && <Check size={16} className="resolved-icon" />}
          <div className="comment-menu-container">
            <button
              className="comment-menu-btn"
              onClick={(e) => {
                e.stopPropagation()
                setShowMenu(!showMenu)
              }}
            >
              <MoreVertical size={16} />
            </button>
            {showMenu && (
              <div className="comment-menu-dropdown">
                <button
                  className="comment-menu-item"
                  onClick={(e) => {
                    e.stopPropagation()
                    onResolve(comment.id)
                    setShowMenu(false)
                  }}
                >
                  {comment.resolved ? '标记为未解决' : '标记为已解决'}
                </button>
                <button
                  className="comment-menu-item delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(comment.id)
                    setShowMenu(false)
                  }}
                >
                  删除
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="floating-comment-content">{comment.content}</div>
    </div>
  )
})

CommentBox.displayName = 'CommentBox'

// 待评论组件
const PendingCommentBox = memo(({
  pendingComment,
  newCommentText,
  top,
  onNewCommentTextChange,
  onSubmit,
  onCancel,
}: {
  pendingComment: { from: number; to: number; selectedText: string }
  newCommentText: string
  top: number
  onNewCommentTextChange?: (text: string) => void
  onSubmit?: () => void
  onCancel?: () => void
}) => {
  return (
    <div
      className="floating-comment-box pending"
      style={{ top: `${top}px` }}
    >
      <textarea
        className="floating-comment-input"
        placeholder="写下你的评论..."
        value={newCommentText}
        onChange={(e) => onNewCommentTextChange?.(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onSubmit?.()
          }
        }}
        rows={2}
        autoFocus
      />
      <div className="floating-comment-actions">
        <button
          className="floating-comment-action submit"
          onClick={onSubmit}
          disabled={!newCommentText.trim()}
        >
          提交
        </button>
        <button
          className="floating-comment-action cancel"
          onClick={onCancel}
        >
          取消
        </button>
      </div>
    </div>
  )
})

PendingCommentBox.displayName = 'PendingCommentBox'

export default function FloatingComments({
  comments,
  activeCommentId,
  editor,
  onDeleteComment,
  onResolveComment,
  onCommentClick,
  pendingComment,
  newCommentText = '',
  onNewCommentTextChange,
  onSubmitComment,
  onCancelComment,
}: FloatingCommentsProps) {
  const [positions, setPositions] = useState<Map<string, number>>(new Map())
  const rafRef = useRef<number | null>(null)

  // 计算所有评论位置，处理重叠
  const calculatePositions = useCallback(() => {
    if (!editor) return

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }

    rafRef.current = requestAnimationFrame(() => {
      const editorElement = editor.view.dom as HTMLElement
      const editorRect = editorElement.getBoundingClientRect()
      
      // 收集所有项目及其原始位置
      const items: Array<{ id: string; originalTop: number }> = []
      
      // 待评论
      if (pendingComment) {
        try {
          const fromPos = editor.view.coordsAtPos(pendingComment.from)
          items.push({ id: 'pending', originalTop: fromPos.top - editorRect.top })
        } catch (e) {
          items.push({ id: 'pending', originalTop: 0 })
        }
      }
      
      // 已有评论
      comments.forEach((comment) => {
        try {
          const fromPos = editor.view.coordsAtPos(comment.from)
          items.push({ id: comment.id, originalTop: fromPos.top - editorRect.top })
        } catch (e) {
          items.push({ id: comment.id, originalTop: 0 })
        }
      })
      
      // 按原始位置排序
      items.sort((a, b) => a.originalTop - b.originalTop)
      
      // 处理重叠
      const newPositions = new Map<string, number>()
      const occupiedRanges: Array<{ start: number; end: number }> = []
      
      items.forEach((item) => {
        let finalTop = item.originalTop
        
        // 检查是否与已占用的范围重叠
        let hasOverlap = true
        while (hasOverlap) {
          hasOverlap = false
          for (const range of occupiedRanges) {
            if (finalTop < range.end && finalTop + COMMENT_BOX_HEIGHT > range.start) {
              // 有重叠，向下移动
              finalTop = range.end + COMMENT_BOX_MARGIN
              hasOverlap = true
              break
            }
          }
        }
        
        newPositions.set(item.id, finalTop)
        occupiedRanges.push({ 
          start: finalTop, 
          end: finalTop + COMMENT_BOX_HEIGHT 
        })
      })
      
      setPositions(newPositions)
    })
  }, [comments, pendingComment, editor])

  useEffect(() => {
    if (!editor) return

    // 初始计算
    calculatePositions()

    // 监听滚动
    const editorElement = editor.view.dom as HTMLElement
    const handleScroll = () => calculatePositions()
    
    // 监听 resize
    const handleResize = () => calculatePositions()
    
    editorElement.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleResize)

    return () => {
      editorElement.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [calculatePositions, editor])

  if (!editor) return null

  const hasComments = comments.length > 0 || pendingComment

  return (
    <div className="floating-comments-container">
      {/* 待评论输入框 - 只渲染位置已计算好的 */}
      {pendingComment && positions.has('pending') && (
        <PendingCommentBox
          pendingComment={pendingComment}
          newCommentText={newCommentText}
          top={positions.get('pending')!}
          onNewCommentTextChange={onNewCommentTextChange}
          onSubmit={onSubmitComment}
          onCancel={onCancelComment}
        />
      )}

      {/* 已有评论 - 只渲染位置已计算好的 */}
      {comments
        .filter((comment) => positions.has(comment.id))
        .map((comment) => (
          <CommentBox
            key={comment.id}
            comment={comment}
            isActive={activeCommentId === comment.id}
            top={positions.get(comment.id)!}
            onDelete={onDeleteComment}
            onResolve={onResolveComment}
            onClick={onCommentClick}
          />
        ))}

      {/* 空状态 */}
      {!hasComments && (
        <div className="floating-comments-empty">
          <MessageSquare size={48} />
          <p>暂无评论</p>
          <span>选中文本并点击评论按钮添加</span>
        </div>
      )}
    </div>
  )
}
