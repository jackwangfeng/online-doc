const express = require('express')
const bcrypt = require('bcryptjs')
const db = require('../db')
const { authenticateToken, generateToken } = require('../middleware/auth')

const router = express.Router()

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body

    // 验证输入
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' })
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' })
    }

    // 检查用户名是否已存在
    const userCheck = await db.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, email]
    )

    if (userCheck.rows.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' })
    }

    // 加密密码
    const saltRounds = 10
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // 创建用户
    const result = await db.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email, created_at',
      [username, email, passwordHash]
    )

    const user = result.rows[0]
    const token = generateToken(user)

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      },
      token,
    })
  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    // 验证输入
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' })
    }

    // 查找用户
    const result = await db.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
      [username]
    )

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const user = result.rows[0]

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password_hash)

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = generateToken(user)

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        created_at: user.created_at,
      },
      token,
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 获取当前用户信息
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, username, email, created_at FROM users WHERE id = $1',
      [req.user.id]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ user: result.rows[0] })
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

module.exports = router
