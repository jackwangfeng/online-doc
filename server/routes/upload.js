const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { v4: uuidv4 } = require('uuid')

// 确保上传目录存在
const uploadDir = path.join(__dirname, '..', 'uploads', 'images')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`
    cb(null, uniqueName)
  }
})

// 文件过滤器 - 只允许图片
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('只允许上传图片文件 (JPEG, PNG, GIF, WebP, BMP)'), false)
  }
}

// 配置 multer
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 限制
  }
})

// 存储上传令牌（内存存储，生产环境应使用Redis）
const uploadTokens = new Map()

// 生成上传URL和令牌
function generateUploadUrl(req, res) {
  try {
    const { filename, contentType } = req.query
    
    if (!filename) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'filename is required' }))
      return
    }

    // 验证文件类型
    const ext = path.extname(filename).toLowerCase()
    const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']
    if (!allowedExts.includes(ext)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid file type' }))
      return
    }

    // 生成唯一文件名和令牌
    const uniqueFilename = `${uuidv4()}${ext}`
    const token = uuidv4()
    
    // 存储令牌信息（5分钟过期）
    uploadTokens.set(token, {
      filename: uniqueFilename,
      originalName: filename,
      contentType: contentType || 'application/octet-stream',
      createdAt: Date.now(),
      used: false
    })

    // 清理过期令牌
    cleanupExpiredTokens()

    // 构建上传URL
    const uploadUrl = `/api/upload/image?token=${token}`
    const imageUrl = `/uploads/images/${uniqueFilename}`

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      uploadUrl,
      imageUrl,
      token,
      expiresIn: 300 // 5分钟
    }))
  } catch (err) {
    console.error('Generate upload URL error:', err)
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err.message }))
  }
}

// 清理过期令牌
function cleanupExpiredTokens() {
  const now = Date.now()
  const expireTime = 5 * 60 * 1000 // 5分钟
  
  for (const [token, info] of uploadTokens.entries()) {
    if (now - info.createdAt > expireTime || info.used) {
      uploadTokens.delete(token)
    }
  }
}

// 处理图片上传（使用令牌）
function handleImageUpload(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`)
  const token = url.searchParams.get('token')

  if (!token) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Upload token is required' }))
    return
  }

  const tokenInfo = uploadTokens.get(token)
  if (!tokenInfo) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Invalid or expired upload token' }))
    return
  }

  if (tokenInfo.used) {
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Token already used' }))
    return
  }

  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '文件大小超过限制 (最大 10MB)' }))
        return
      }
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
      return
    } else if (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
      return
    }

    if (!req.file) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: '没有上传文件' }))
      return
    }

    // 标记令牌已使用
    tokenInfo.used = true

    // 构建图片 URL
    const imageUrl = `/uploads/images/${req.file.filename}`

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      url: imageUrl,
      filename: req.file.filename,
      originalName: tokenInfo.originalName,
      size: req.file.size
    }))
  })
}

// 处理图片删除
function handleImageDelete(req, res, filename) {
  const filePath = path.join(uploadDir, filename)
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: '文件不存在' }))
      return
    }

    fs.unlink(filePath, (err) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '删除文件失败' }))
        return
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true, message: '文件已删除' }))
    })
  })
}

// 提供静态文件服务
function serveImage(req, res, filename) {
  const filePath = path.join(uploadDir, filename)
  
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: '文件不存在' }))
      return
    }

    // 根据文件扩展名设置 Content-Type
    const ext = path.extname(filename).toLowerCase()
    const contentTypeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp'
    }
    const contentType = contentTypeMap[ext] || 'application/octet-stream'

    res.writeHead(200, { 'Content-Type': contentType })
    fs.createReadStream(filePath).pipe(res)
  })
}

module.exports = {
  generateUploadUrl,
  handleImageUpload,
  handleImageDelete,
  serveImage
}
