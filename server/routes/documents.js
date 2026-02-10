const express = require('express')
const db = require('../db')
const { authenticateToken } = require('../middleware/auth')

const router = express.Router()

// 获取用户的所有文档
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT d.id, d.title, d.created_at, d.updated_at, u.username as owner_name
       FROM documents d
       JOIN users u ON d.owner_id = u.id
       WHERE d.owner_id = $1
       ORDER BY d.updated_at DESC`,
      [req.user.id]
    )

    res.json({ documents: result.rows })
  } catch (error) {
    console.error('Get documents error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 创建新文档
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title } = req.body
    const documentTitle = title || 'Untitled Document'

    const result = await db.query(
      'INSERT INTO documents (title, owner_id) VALUES ($1, $2) RETURNING *',
      [documentTitle, req.user.id]
    )

    res.status(201).json({
      message: 'Document created successfully',
      document: result.rows[0],
    })
  } catch (error) {
    console.error('Create document error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 获取单个文档信息
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    const result = await db.query(
      `SELECT d.id, d.title, d.created_at, d.updated_at, 
              d.owner_id, u.username as owner_name
       FROM documents d
       JOIN users u ON d.owner_id = u.id
       WHERE d.id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const document = result.rows[0]

    // 检查权限（暂时放开，只检查是否是所有者）
    if (document.owner_id !== req.user.id) {
      // 未来可以检查 document_permissions 表
      return res.status(403).json({ error: 'Access denied' })
    }

    res.json({ document })
  } catch (error) {
    console.error('Get document error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 更新文档信息
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params
    const { title } = req.body

    // 检查文档是否存在且属于当前用户
    const checkResult = await db.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    )

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const document = checkResult.rows[0]

    if (document.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    const result = await db.query(
      'UPDATE documents SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [title, id]
    )

    res.json({
      message: 'Document updated successfully',
      document: result.rows[0],
    })
  } catch (error) {
    console.error('Update document error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 删除文档
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params

    // 检查文档是否存在且属于当前用户
    const checkResult = await db.query(
      'SELECT * FROM documents WHERE id = $1',
      [id]
    )

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' })
    }

    const document = checkResult.rows[0]

    if (document.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' })
    }

    await db.query('DELETE FROM documents WHERE id = $1', [id])

    res.json({ message: 'Document deleted successfully' })
  } catch (error) {
    console.error('Delete document error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
