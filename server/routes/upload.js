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

// 处理图片上传
function handleImageUpload(req, res) {
  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer 错误
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '文件大小超过限制 (最大 10MB)' }))
        return
      }
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
      return
    } else if (err) {
      // 其他错误
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err.message }))
      return
    }

    // 上传成功
    if (!req.file) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: '没有上传文件' }))
      return
    }

    // 构建图片 URL
    const imageUrl = `/uploads/images/${req.file.filename}`

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      success: true,
      url: imageUrl,
      filename: req.file.filename,
      originalName: req.file.originalname,
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
  handleImageUpload,
  handleImageDelete,
  serveImage
}
