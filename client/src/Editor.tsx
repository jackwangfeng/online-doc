import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Color from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Bold, Italic, Strikethrough, Code, Quote,
  Heading1, Heading2, Heading3,
  List, ListOrdered, Minus,
  Table as TableIcon, Plus, Trash2,
  MessageSquare, FunctionSquare, X, Check,
  Printer, History, RotateCcw, Save, FileCode, FileUp,
  Code2, Image as ImageIcon, Link as LinkIcon, Palette
} from 'lucide-react'
import { marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css'
import './Editor.css'
import TableOfContents from './TableOfContents'

interface EditorProps {
  roomId: string
  userName: string
}

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  title: string
  children: React.ReactNode
}

// Color picker component
function ColorPicker({ editor }: { editor: any }) {
  const [isOpen, setIsOpen] = useState(false)
  const [customColor, setCustomColor] = useState('#3b82f6')
  const containerRef = useRef<HTMLDivElement>(null)

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as unknown as globalThis.Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const colors = [
    '#000000', '#1f2937', '#374151', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6',
    '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
    '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    '#f43f5e', '#7c2d12', '#9a3412', '#854d0e', '#3f6212', '#14532d', '#064e3b', '#115e59',
  ]

  const currentColor = editor?.getAttributes('textStyle').color

  const handleColorSelect = (color: string | null) => {
    if (color === null) {
      editor.chain().focus().unsetColor().run()
    } else {
      editor.chain().focus().setColor(color).run()
    }
    setIsOpen(false)
  }

  return (
    <div className="color-picker-container" ref={containerRef}>
      <button
        className={`toolbar-btn ${currentColor ? 'is-active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Text Color"
      >
        <Palette size={18} />
      </button>
      {isOpen && (
        <div className="color-picker-dropdown">
          <div className="color-picker-header">Text Color</div>
          <div className="color-grid">
            <div
              className={`color-swatch clear ${!currentColor ? 'active' : ''}`}
              onClick={() => handleColorSelect(null)}
              title="Clear color"
            />
            {colors.map((color) => (
              <div
                key={color}
                className={`color-swatch ${currentColor === color ? 'active' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => handleColorSelect(color)}
                title={color}
              />
            ))}
          </div>
          <div className="color-custom">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
            />
            <input
              type="text"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              placeholder="#3b82f6"
            />
            <button
              className="toolbar-btn"
              onClick={() => handleColorSelect(customColor)}
              title="Apply custom color"
            >
              <Check size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface Comment {
  id: string
  content: string
  author: string
  createdAt: string
  resolved?: boolean
  from: number
  to: number
  selectedText: string
}

interface PendingComment {
  id: string
  from: number
  to: number
  selectedText: string
}

interface Version {
  id: number
  createdAt: string
  dataSize: number
  isCurrent?: boolean
}

interface Snapshot {
  id: number
  name: string
  createdAt: string
  createdBy: string
}

function ToolbarButton({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`toolbar-btn ${isActive ? 'is-active' : ''}`}
      disabled={disabled}
      data-tooltip={title}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="toolbar-divider" />
}

// 打印预览组件 - 自动分页
interface PrintPreviewProps {
  editor: any
}

function PrintPreview({ editor }: PrintPreviewProps) {
  const [pages, setPages] = useState<string[]>([''])

  useEffect(() => {
    if (!editor) return

    // 获取编辑器 HTML 内容
    const html = editor.getHTML()

    // 创建一个临时容器来计算分页
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = html
    tempDiv.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: 170mm;
      padding: 0;
      font-size: 12pt;
      line-height: 1.5;
      visibility: hidden;
    `
    document.body.appendChild(tempDiv)

    // A4 页面可用高度（减去页边距）
    const pageHeight = 257 * 3.78 // 257mm in px (297mm - 40mm margins)

    // 简单的分页逻辑：按段落分割
    const children = Array.from(tempDiv.children)
    const newPages: string[] = []
    let currentPage = ''
    let currentHeight = 0

    children.forEach((child) => {
      const el = child as HTMLElement
      const height = el.offsetHeight

      if (currentHeight + height > pageHeight && currentPage) {
        // 当前页已满，保存并开始新页
        newPages.push(currentPage)
        currentPage = el.outerHTML
        currentHeight = height
      } else {
        // 添加到当前页
        currentPage += el.outerHTML
        currentHeight += height
      }
    })

    // 添加最后一页
    if (currentPage) {
      newPages.push(currentPage)
    }

    // 如果没有内容，至少有一页
    if (newPages.length === 0) {
      newPages.push('<p></p>')
    }

    setPages(newPages)

    // 清理
    document.body.removeChild(tempDiv)
  }, [editor, editor?.getHTML()])

  return (
    <div className="print-preview-container">
      {pages.map((pageContent, index) => (
        <div key={index} className="a4-page">
          <div className="page-number">Page {index + 1}</div>
          <div
            className="page-content"
            dangerouslySetInnerHTML={{ __html: pageContent }}
          />
        </div>
      ))}
    </div>
  )
}

// 数学公式扩展 - 使用 KaTeX 渲染
import { Node, mergeAttributes } from '@tiptap/core'
import katex from 'katex'

const MathFormula = Node.create({
  name: 'mathFormula',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,
  addAttributes() {
    return {
      formula: {
        default: '',
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span[data-math-formula]',
      },
    ]
  },
  renderHTML({ HTMLAttributes, node }) {
    return ['span', mergeAttributes({ 'data-math-formula': HTMLAttributes.formula }, HTMLAttributes), node.attrs.formula]
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'math-formula'
      dom.style.display = 'inline-block'
      
      try {
        const html = katex.renderToString(node.attrs.formula, {
          throwOnError: false,
          displayMode: false,
        })
        dom.innerHTML = html
      } catch (error) {
        dom.textContent = `$${node.attrs.formula}$`
        dom.style.color = '#dc2626'
      }
      
      return { dom }
    }
  },
})

export default function Editor({ roomId, userName }: EditorProps) {
  const [ydoc] = useState(() => new Y.Doc())
  const [status, setStatus] = useState('connecting')
  const [comments, setComments] = useState<Comment[]>([])
  const [pendingComment, setPendingComment] = useState<PendingComment | null>(null)
  const [newCommentText, setNewCommentText] = useState('')
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null)
  const [hasSelection, setHasSelection] = useState(false)
  const [isPrintPreview, setIsPrintPreview] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [versions, setVersions] = useState<Version[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [newSnapshotName, setNewSnapshotName] = useState('')
  const editorRef = useRef<any>(null)
  const commentsMapRef = useRef<Y.Map<any> | null>(null)

  useEffect(() => {
    const wsProvider = new WebsocketProvider(
      'ws://localhost:3000',
      roomId,
      ydoc
    )

    wsProvider.on('status', (event: { status: string }) => {
      setStatus(event.status)
    })

    wsProvider.awareness.setLocalStateField('user', {
      name: userName,
      color: '#958DF1',
    })

    // 获取或创建共享的评论 Map
    const commentsMap = ydoc.getMap('comments')
    commentsMapRef.current = commentsMap

    // 监听评论变化
    const handleCommentsChange = () => {
      const commentsArray: Comment[] = []
      commentsMap.forEach((value) => {
        commentsArray.push(value as Comment)
      })
      // 按时间排序
      commentsArray.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      setComments(commentsArray)
    }

    commentsMap.observe(handleCommentsChange)
    handleCommentsChange() // 初始加载

    return () => {
      commentsMap.unobserve(handleCommentsChange)
      wsProvider.destroy()
    }
  }, [roomId, ydoc, userName])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {
          HTMLAttributes: {
            class: 'hljs',
          },
        },
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Highlight.configure({
        multicolor: true,
      }),
      MathFormula,
      Image.configure({
        allowBase64: true,
      }),
      Link.configure({
        openOnClick: false,
      }),
      TextStyle,
      Color.configure({
        types: ['textStyle'],
      }),
    ],
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection
      setHasSelection(from !== to)
    },
    onUpdate: ({ editor }) => {
      // Highlight code blocks after update
      const codeBlocks = editor.view.dom.querySelectorAll('pre code')
      codeBlocks.forEach((block) => {
        const language = block.parentElement?.getAttribute('data-language')
        if (language && language !== 'plaintext') {
          hljs.highlightElement(block as HTMLElement)
        }
      })

      // 检查评论对应的文字是否还存在
      const commentsMap = commentsMapRef.current
      if (commentsMap) {
        const commentsToDelete: string[] = []
        commentsMap.forEach((value, key) => {
          const comment = value as Comment
          try {
            // 尝试获取评论对应的文字
            const currentText = editor.state.doc.textBetween(comment.from, comment.to)
            // 如果文字已被删除或改变，删除评论
            if (currentText !== comment.selectedText) {
              commentsToDelete.push(key)
            }
          } catch (e) {
            // 如果选区已超出文档范围，删除评论
            commentsToDelete.push(key)
          }
        })
        // 删除失效的评论
        commentsToDelete.forEach((id) => {
          commentsMap.delete(id)
        })
      }
    },
  }, [ydoc, roomId, userName])

  // 保存 editor 引用
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // 处理图片粘贴上传
  useEffect(() => {
    if (!editor) return

    const handlePaste = async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return

      const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'))
      if (imageItems.length === 0) return

      // 阻止默认粘贴行为
      event.preventDefault()

      for (const item of imageItems) {
        const file = item.getAsFile()
        if (!file) continue

        try {
          const formData = new FormData()
          formData.append('image', file)

          const response = await fetch('http://localhost:3000/api/upload/image', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            throw new Error('Upload failed')
          }

          const data = await response.json()
          if (data.success && data.url) {
            // 在光标位置插入图片
            const imageUrl = `http://localhost:3000${data.url}`
            editor.chain().focus().setImage({ src: imageUrl }).run()
          }
        } catch (error) {
          console.error('Error uploading image:', error)
          alert('图片上传失败，请重试')
        }
      }
    }

    // 监听粘贴事件
    const editorElement = editor.view.dom
    editorElement.addEventListener('paste', handlePaste)

    return () => {
      editorElement.removeEventListener('paste', handlePaste)
    }
  }, [editor])

  const startComment = useCallback(() => {
    const currentEditor = editorRef.current
    if (!currentEditor) return

    const { from, to } = currentEditor.state.selection
    const selectedText = currentEditor.state.doc.textBetween(from, to)

    if (from === to) return

    const pending: PendingComment = {
      id: Date.now().toString(),
      from,
      to,
      selectedText,
    }

    // 高亮选中的文字
    currentEditor.chain().focus().setHighlight({ color: '#fef08a' }).run()

    setPendingComment(pending)
    setNewCommentText('')
  }, [])

  const submitComment = useCallback(() => {
    if (!pendingComment || !newCommentText.trim()) return

    const comment: Comment = {
      id: pendingComment.id,
      content: newCommentText,
      author: userName,
      createdAt: new Date().toISOString(),
      from: pendingComment.from,
      to: pendingComment.to,
      selectedText: pendingComment.selectedText,
    }

    // 保存到 Yjs
    commentsMapRef.current?.set(comment.id, comment)

    setPendingComment(null)
    setNewCommentText('')
    setActiveCommentId(comment.id)
  }, [pendingComment, newCommentText, userName])

  const cancelComment = useCallback(() => {
    setPendingComment(null)
    setNewCommentText('')
  }, [])

  const deleteComment = useCallback((id: string) => {
    const comment = commentsMapRef.current?.get(id) as Comment | undefined
    const currentEditor = editorRef.current

    // 移除文档中的高亮
    if (comment && currentEditor) {
      try {
        currentEditor.chain().focus().setTextSelection({ from: comment.from, to: comment.to }).unsetHighlight().run()
      } catch (e) {
        // 如果选区已不存在，忽略错误
      }
    }

    commentsMapRef.current?.delete(id)
    if (activeCommentId === id) {
      setActiveCommentId(null)
    }
  }, [activeCommentId])

  const resolveComment = useCallback((id: string) => {
    const comment = commentsMapRef.current?.get(id) as Comment | undefined
    if (comment) {
      commentsMapRef.current?.set(id, { ...comment, resolved: !comment.resolved })
    }
  }, [])

  const jumpToComment = useCallback((comment: Comment) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return
    currentEditor.chain().focus().setTextSelection({ from: comment.from, to: comment.to }).run()
    setActiveCommentId(comment.id)
  }, [])

  // 版本历史相关方法
  const fetchVersions = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:3000/versions/${roomId}/history`)
      const data = await response.json()
      setVersions(data.versions || [])
    } catch (err) {
      console.error('Error fetching versions:', err)
    }
  }, [roomId])

  const fetchSnapshots = useCallback(async () => {
    try {
      const response = await fetch(`http://localhost:3000/versions/${roomId}/snapshots`)
      const data = await response.json()
      setSnapshots(data.snapshots || [])
    } catch (err) {
      console.error('Error fetching snapshots:', err)
    }
  }, [roomId])

  const createSnapshot = useCallback(async () => {
    if (!newSnapshotName.trim()) return
    try {
      const response = await fetch(`http://localhost:3000/versions/${roomId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newSnapshotName, createdBy: userName })
      })
      if (response.ok) {
        setNewSnapshotName('')
        fetchSnapshots()
      }
    } catch (err) {
      console.error('Error creating snapshot:', err)
    }
  }, [roomId, newSnapshotName, userName, fetchSnapshots])

  const rollbackToVersion = useCallback(async (versionId: number) => {
    if (!confirm('Are you sure you want to rollback to this version?\n\nAll history will be preserved. You can rollback to any version at any time.')) return
    try {
      const response = await fetch(`http://localhost:3000/versions/${roomId}/rollback/${versionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ createdBy: userName })
      })
      if (response.ok) {
        alert('Rollback successful!\n\nAll version history is preserved.\nThe page will now refresh to show the rolled back version.')
        // 刷新页面以重新加载回滚后的文档
        window.location.reload()
      }
    } catch (err) {
      console.error('Error rolling back:', err)
    }
  }, [roomId, userName])

  const restoreSnapshot = useCallback(async (snapshotId: number) => {
    if (!confirm('Are you sure you want to restore this snapshot?')) return
    try {
      const response = await fetch(`http://localhost:3000/versions/${roomId}/restore/${snapshotId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ createdBy: userName })
      })
      if (response.ok) {
        alert('Restore successful! The page will refresh to show the restored version.')
        // 刷新页面以重新加载恢复的文档
        window.location.reload()
      }
    } catch (err) {
      console.error('Error restoring snapshot:', err)
    }
  }, [roomId, userName])

  useEffect(() => {
    if (showVersionHistory) {
      fetchVersions()
      fetchSnapshots()
    }
  }, [showVersionHistory, fetchVersions, fetchSnapshots])

  if (!editor) {
    return <div className="editor-loading">Loading...</div>
  }

  const handleTocItemClick = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="editor-wrapper">
      <div className="toc-sidebar">
        <TableOfContents 
          editorContent={editor?.getHTML() || ''} 
          onItemClick={handleTocItemClick}
        />
      </div>
      <div className="editor-main">
        <div className="toolbar">
          <div className="toolbar-group">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              title="Bold"
            >
              <Bold size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              title="Italic"
            >
              <Italic size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              isActive={editor.isActive('strike')}
              title="Strikethrough"
            >
              <Strikethrough size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleCode().run()}
              isActive={editor.isActive('code')}
              title="Inline Code"
            >
              <Code size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                const languages = ['javascript', 'typescript', 'python', 'java', 'cpp', 'html', 'css', 'sql', 'bash', 'json', 'yaml', 'markdown', 'plaintext']
                const language = window.prompt(
                  `Select language:\n${languages.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n\nEnter number or name:`,
                  '1'
                )
                if (language) {
                  const selectedLang = languages[parseInt(language) - 1] || language
                  editor.chain().focus().toggleCodeBlock({ language: selectedLang }).run()
                }
              }}
              isActive={editor.isActive('codeBlock')}
              title="Code Block"
            >
              <Code2 size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              isActive={editor.isActive('highlight')}
              title="Highlight"
            >
              <span style={{ fontSize: 14, fontWeight: 'bold' }}>H</span>
            </ToolbarButton>
            <ColorPicker editor={editor} />
          </div>

          <Divider />

          <div className="toolbar-group">
            <ToolbarButton
              onClick={() => {
                const url = window.prompt('Enter image URL:', 'https://')
                if (url) {
                  editor.chain().focus().setImage({ src: url }).run()
                }
              }}
              title="Insert Image"
            >
              <ImageIcon size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                const url = window.prompt('Enter link URL:', 'https://')
                if (url) {
                  editor.chain().focus().setLink({ href: url }).run()
                }
              }}
              isActive={editor.isActive('link')}
              title="Insert Link"
            >
              <LinkIcon size={18} />
            </ToolbarButton>
          </div>

          <Divider />

          <div className="toolbar-group">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              isActive={editor.isActive('heading', { level: 1 })}
              title="Heading 1"
            >
              <Heading1 size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor.isActive('heading', { level: 2 })}
              title="Heading 2"
            >
              <Heading2 size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              isActive={editor.isActive('heading', { level: 3 })}
              title="Heading 3"
            >
              <Heading3 size={18} />
            </ToolbarButton>
          </div>

          <Divider />

          <div className="toolbar-group">
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive('bulletList')}
              title="Bullet List"
            >
              <List size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive('orderedList')}
              title="Ordered List"
            >
              <ListOrdered size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={editor.isActive('blockquote')}
              title="Quote"
            >
              <Quote size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Horizontal Rule"
            >
              <Minus size={18} />
            </ToolbarButton>
          </div>

          <Divider />

          <div className="toolbar-group">
            <ToolbarButton
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
              title="Insert Table"
            >
              <TableIcon size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              disabled={!editor.can().addColumnBefore()}
              title="Add Column Before"
            >
              <Plus size={16} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => editor.chain().focus().deleteTable().run()}
              disabled={!editor.can().deleteTable()}
              title="Delete Table"
            >
              <Trash2 size={16} />
            </ToolbarButton>
          </div>

          <Divider />

          <div className="toolbar-group">
            <ToolbarButton
              onClick={() => {
                const formula = window.prompt('Enter math formula (e.g., x^2 + y^2 = r^2):', 'x^2 + y^2 = r^2')
                if (formula) {
                  editor.chain().focus().insertContent({
                    type: 'mathFormula',
                    attrs: { formula },
                  }).run()
                }
              }}
              title="Insert Math Formula"
            >
              <FunctionSquare size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={startComment}
              disabled={!hasSelection || pendingComment !== null}
              title={pendingComment ? 'Comment in progress' : 'Add Comment'}
            >
              <MessageSquare size={18} />
            </ToolbarButton>
          </div>

          <Divider />

          <div className="toolbar-group">
            <ToolbarButton
              onClick={() => setIsPrintPreview(!isPrintPreview)}
              isActive={isPrintPreview}
              title={isPrintPreview ? 'Exit Print Preview' : 'Print Preview'}
            >
              <Printer size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => setShowVersionHistory(!showVersionHistory)}
              isActive={showVersionHistory}
              title="Version History"
            >
              <History size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.md,.markdown,.txt'
                input.onchange = async (e) => {
                  const file = (e.target as HTMLInputElement).files?.[0]
                  if (file) {
                    const text = await file.text()
                    const html = marked(text)
                    editor.chain().focus().setContent(html).run()
                  }
                }
                input.click()
              }}
              title="Import Markdown"
            >
              <FileUp size={18} />
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                const markdown = editor.getText()
                const blob = new Blob([markdown], { type: 'text/markdown' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `document-${roomId}.md`
                a.click()
                URL.revokeObjectURL(url)
              }}
              title="Export Markdown"
            >
              <FileCode size={18} />
            </ToolbarButton>
          </div>

          <div className="toolbar-spacer" />

          <div className={`connection-status ${status}`}>
            <span className="status-dot" />
            <span className="status-text">{status === 'connected' ? 'Connected' : 'Connecting...'}</span>
          </div>
        </div>
        <div className={`editor-content-wrapper ${isPrintPreview ? 'print-preview' : ''}`}>
          {isPrintPreview ? (
            <PrintPreview editor={editor} />
          ) : (
            <EditorContent editor={editor} className="editor-content" />
          )}
        </div>
      </div>

      {showVersionHistory ? (
        <div className="versions-sidebar">
          <div className="versions-header">
            <h3>Version History</h3>
            <button className="versions-close-btn" onClick={() => setShowVersionHistory(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="versions-section snapshots-section">
            <div className="section-header">
              <h4>Snapshots</h4>
              <span className="section-count">{snapshots.length}</span>
            </div>
            <div className="snapshot-input">
              <input
                type="text"
                placeholder="Name your snapshot..."
                value={newSnapshotName}
                onChange={(e) => setNewSnapshotName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createSnapshot()}
              />
              <button 
                className="snapshot-save-btn"
                onClick={createSnapshot} 
                disabled={!newSnapshotName.trim()}
              >
                <Save size={16} />
                Save
              </button>
            </div>
            <div className="snapshots-list">
              {snapshots.length === 0 ? (
                <div className="versions-empty">
                  <div className="empty-icon">📸</div>
                  <p>No snapshots yet</p>
                  <span>Save important versions here</span>
                </div>
              ) : (
                snapshots.map((snapshot, index) => (
                  <div key={snapshot.id} className="snapshot-item">
                    <div className="snapshot-main">
                      <span className="snapshot-number">{snapshots.length - index}</span>
                      <div className="snapshot-info">
                        <div className="snapshot-name">{snapshot.name}</div>
                        <div className="snapshot-meta">
                          <span className="meta-item">{snapshot.createdBy}</span>
                          <span className="meta-separator">•</span>
                          <span className="meta-item">{new Date(snapshot.createdAt).toLocaleString('zh-CN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      className="snapshot-restore-btn"
                      onClick={() => restoreSnapshot(snapshot.id)}
                      title="Restore to this version"
                    >
                      <RotateCcw size={14} />
                      恢复
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="versions-section autosave-section">
            <div className="section-header">
              <h4>Auto-saved</h4>
              <span className="section-count">{versions.length}</span>
            </div>
            <div className="versions-list">
              {versions.length === 0 ? (
                <div className="versions-empty">
                  <div className="empty-icon">🕐</div>
                  <p>No auto-saved versions</p>
                </div>
              ) : (
                versions.map((version, index) => (
                  <div key={version.id} className={`version-item ${version.isCurrent ? 'current' : ''}`}>
                    <div className="version-main">
                      <span className="version-number">{versions.length - index}</span>
                      <div className="version-info">
                        <div className="version-time">
                          {new Date(version.createdAt).toLocaleString('zh-CN', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          {version.isCurrent && <span className="current-badge">current</span>}
                        </div>
                        <div className="version-size">{(version.dataSize / 1024).toFixed(1)} KB</div>
                      </div>
                    </div>
                    {!version.isCurrent && (
                      <button
                        className="version-rollback-btn"
                        onClick={() => rollbackToVersion(version.id)}
                        title="Rollback to this version"
                      >
                        <RotateCcw size={14} />
                        回滚
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="comments-sidebar">
          <div className="comments-header">
            <h3>Comments ({comments.length})</h3>
          </div>

        <div className="comments-list">
          {/* 待评论区域 */}
          {pendingComment && (
            <div className="comment-item pending">
              <div className="comment-selected-text">
                "{pendingComment.selectedText.length > 50 ? pendingComment.selectedText.slice(0, 50) + '...' : pendingComment.selectedText}"
              </div>
              <div className="comment-status">Writing comment...</div>
              <textarea
                className="comments-input"
                placeholder="Write your comment..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitComment()
                  }
                }}
                rows={3}
                autoFocus
              />
              <div className="comment-actions">
                <button
                  className="comment-action-btn submit"
                  onClick={submitComment}
                  disabled={!newCommentText.trim()}
                >
                  <Check size={14} />
                  Submit
                </button>
                <button
                  className="comment-action-btn cancel"
                  onClick={cancelComment}
                >
                  <X size={14} />
                  Cancel
                </button>
              </div>
            </div>
          )}

          {comments.length === 0 && !pendingComment ? (
            <div className="comments-empty">
              <MessageSquare size={48} className="comments-empty-icon" />
              <p>No comments yet</p>
              <span>Select text and click the comment button to add one</span>
            </div>
          ) : (
            comments.map(comment => (
              <div
                key={comment.id}
                className={`comment-item ${comment.resolved ? 'resolved' : ''} ${activeCommentId === comment.id ? 'active' : ''}`}
                onClick={() => jumpToComment(comment)}
              >
                <div className="comment-selected-text">
                  "{comment.selectedText.length > 50 ? comment.selectedText.slice(0, 50) + '...' : comment.selectedText}"
                </div>
                <div className="comment-header">
                  <span className="comment-author">{comment.author}</span>
                  <span className="comment-time">
                    {new Date(comment.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="comment-content">{comment.content}</p>
                <div className="comment-actions">
                  <button
                    className="comment-action-btn resolve"
                    onClick={(e) => {
                      e.stopPropagation()
                      resolveComment(comment.id)
                    }}
                  >
                    {comment.resolved ? 'Unresolve' : 'Resolve'}
                  </button>
                  <button
                    className="comment-action-btn delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteComment(comment.id)
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      )}
    </div>
  )
}
