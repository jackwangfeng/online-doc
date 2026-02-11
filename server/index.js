#!/usr/bin/env node

/**
 * Yjs WebSocket 服务器
 * 使用 y-websocket 的官方实现 + PostgreSQL 持久化
 */

const WebSocket = require('ws')
const http = require('http')
const Y = require('yjs')
const { setupWSConnection, setPersistence, docs } = require('y-websocket/bin/utils')
const persistence = require('./yjs-persistence')
const db = require('./db')
const jwt = require('jsonwebtoken')
const { OAuth2Client } = require('google-auth-library')
const upload = require('./routes/upload')
const connectionManager = require('./connection-manager')

const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 3000

// Google OAuth 配置
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '420915666656-pqdnftq8dvapd7ih1t661g9kk63ivljv.apps.googleusercontent.com'
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key'
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID)

// 自定义持久化层
const customPersistence = {
  provider: persistence,
  bindState: async (docName, ydoc) => {
    // 使用 yjs-persistence 中的防抖保存机制
    // 这会加载文档并设置防抖监听器
    const persistedYdoc = await persistence.getYDoc(docName)
    
    // 将加载的状态同步到 y-websocket 的 ydoc
    const state = Y.encodeStateAsUpdate(persistedYdoc)
    if (state.length > 0) {
      Y.applyUpdate(ydoc, state)
    }
    
    // 设置从 y-websocket ydoc 到持久化 ydoc 的同步
    // 这样用户的编辑会先进入 y-websocket 的 ydoc，然后同步到持久化层
    ydoc.on('update', (update, origin) => {
      // 将更新应用到持久化 ydoc，触发防抖保存
      Y.applyUpdate(persistedYdoc, update)
    })
    
    console.log(`Bound state for room: ${docName} with debounced persistence`)
  },
  writeState: async (docName, ydoc) => {
    console.log(`Persisting document: ${docName}`)
    // 注意：不要在这里返回，让 Promise 永远 pending
    // 这样可以阻止 y-websocket 删除文档
    // 文档的生命周期由 ConnectionManager 管理
    return new Promise(() => {})
  }
}

// 设置持久化层
setPersistence(customPersistence)

const wss = new WebSocket.Server({ noServer: true })

const server = http.createServer((request, response) => {
  // 设置 CORS 头
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (request.method === 'OPTIONS') {
    response.writeHead(200)
    response.end()
    return
  }
  
  // 添加一个简单的状态页面
  if (request.url === '/status') {
    const activeDocs = Array.from(docs.keys())
    const connectionStats = connectionManager.getStats()
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({
      status: 'running',
      activeDocuments: activeDocs.length,
      documents: activeDocs.map(name => ({
        name,
        connections: connectionStats[name] || 0
      })),
      connectionStats
    }, null, 2))
    return
  }
  
  // 版本历史 API 路由
  if (request.url.startsWith('/versions/')) {
    handleVersionsAPI(request, response)
    return
  }

  // 认证路由
  if (request.url === '/auth/google' && request.method === 'POST') {
    handleGoogleAuth(request, response)
    return
  }

  // 文档管理路由
  if (request.url.startsWith('/api/documents')) {
    handleDocumentsAPI(request, response)
    return
  }

  // 图片上传路由
  if (request.url === '/api/upload/image' && request.method === 'POST') {
    upload.handleImageUpload(request, response)
    return
  }

  // 图片访问路由
  if (request.url.startsWith('/uploads/images/')) {
    const filename = request.url.split('/').pop()
    upload.serveImage(request, response, filename)
    return
  }

  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('Yjs WebSocket Server\n')
})

// 处理版本历史 API
async function handleVersionsAPI(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const pathParts = url.pathname.split('/')
  
  if (pathParts.length < 3) {
    response.writeHead(400, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'Invalid path' }))
    return
  }
  
  const roomName = pathParts[2]
  const action = pathParts[3] || 'history'
  
  try {
    if (action === 'history' && request.method === 'GET') {
      // 获取版本历史
      const limit = parseInt(url.searchParams.get('limit')) || 50
      const history = await persistence.getVersionHistory(roomName, limit)
      const currentVersionId = await persistence.getCurrentVersion(roomName)
      
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        roomName,
        currentVersionId,
        versions: history.map(v => ({
          id: v.id,
          createdAt: v.created_at,
          dataSize: v.data_size,
          isCurrent: v.id === currentVersionId
        }))
      }))
      return
    }
    
    if (action === 'current' && request.method === 'GET') {
      // 获取当前激活的版本
      const currentVersionId = await persistence.getCurrentVersion(roomName)
      
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        roomName,
        currentVersionId,
        isRolledBack: currentVersionId !== null
      }))
      return
    }
    
    if (action === 'snapshots' && request.method === 'GET') {
      // 获取所有快照
      const snapshots = await persistence.getSnapshots(roomName)
      
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        roomName,
        snapshots: snapshots.map(s => ({
          id: s.id,
          name: s.snapshot_name,
          createdAt: s.created_at,
          createdBy: s.created_by
        }))
      }))
      return
    }
    
    if (action === 'snapshots' && request.method === 'POST') {
      // 创建快照
      let body = ''
      request.on('data', chunk => body += chunk)
      request.on('end', async () => {
        try {
          const { name, createdBy = 'system' } = JSON.parse(body)
          if (!name) {
            response.writeHead(400, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify({ error: 'Snapshot name is required' }))
            return
          }
          
          await persistence.createSnapshot(roomName, name, createdBy)
          
          response.writeHead(201, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({
            message: 'Snapshot created successfully',
            roomName,
            snapshotName: name
          }))
        } catch (err) {
          response.writeHead(500, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
    
    if (action === 'rollback' && request.method === 'POST') {
      // 回滚到特定版本
      const versionId = pathParts[4]
      if (!versionId) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'Version ID is required' }))
        return
      }
      
      // 从请求体中获取用户名
      let body = ''
      request.on('data', chunk => body += chunk)
      const result = await new Promise((resolve, reject) => {
        request.on('end', async () => {
          try {
            const data = body ? JSON.parse(body) : {}
            const createdBy = data.createdBy || 'unknown'
            const rollbackResult = await persistence.rollbackToVersion(roomName, parseInt(versionId), createdBy)
            resolve(rollbackResult)
          } catch (err) {
            reject(err)
          }
        })
      })
      
      // 关键：关闭该房间的所有 WebSocket 连接，强制客户端重新连接和同步
      // 这是确保回滚生效的必要步骤
      const docKey = roomName
      const ydoc = docs.get(docKey)
      if (ydoc) {
        // y-websocket 将连接存储在 ydoc.conns 中
        // 需要遍历并关闭所有连接
        if (ydoc.conns && ydoc.conns instanceof Map) {
          ydoc.conns.forEach((_, ws) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close(1000, 'Document rolled back, please reconnect')
            }
          })
        }
        
        // 从内存中删除文档，强制下次重新加载
        docs.delete(docKey)
        persistence.clearDocumentCache(roomName)
        
        console.log(`Closed all connections for room ${roomName} after rollback`)
      }
      
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        message: 'Rollback successful',
        roomName,
        versionId,
        requiresReconnect: true,
        details: result
      }))
      return
    }
    
    if (action === 'restore' && request.method === 'POST') {
      // 从快照恢复
      const snapshotId = pathParts[4]
      if (!snapshotId) {
        response.writeHead(400, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'Snapshot ID is required' }))
        return
      }
      
      await persistence.restoreSnapshot(roomName, parseInt(snapshotId))
      
      // 关键：关闭该房间的所有 WebSocket 连接，强制客户端重新连接和同步
      const docKey = roomName
      const ydoc = docs.get(docKey)
      if (ydoc) {
        if (ydoc.conns && ydoc.conns instanceof Map) {
          ydoc.conns.forEach((_, ws) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.close(1000, 'Document restored from snapshot, please reconnect')
            }
          })
        }
        
        docs.delete(docKey)
        persistence.clearDocumentCache(roomName)
        
        console.log(`Closed all connections for room ${roomName} after restore`)
      }
      
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        message: 'Restore successful',
        roomName,
        snapshotId,
        requiresReconnect: true
      }))
      return
    }
    
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'Not found' }))
  } catch (err) {
    console.error('Versions API error:', err)
    response.writeHead(500, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: err.message }))
  }
}

// 处理 Google 认证
async function handleGoogleAuth(request, response) {
  let body = ''
  request.on('data', chunk => body += chunk)
  request.on('end', async () => {
    try {
      const { credential } = JSON.parse(body)
      
      // 验证 Google ID Token
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: GOOGLE_CLIENT_ID
      })
      
      const payload = ticket.getPayload()
      const email = payload.email
      const googleId = payload.sub
      const displayName = payload.name
      const avatar = payload.picture
      
      // 检查用户是否已存在
      let userResult = await db.query(
        'SELECT * FROM users WHERE email = $1 OR google_id = $2',
        [email, googleId]
      )
      
      let user
      
      if (userResult.rows.length > 0) {
        user = userResult.rows[0]
        // 更新用户信息
        if (!user.google_id) {
          await db.query(
            'UPDATE users SET google_id = $1, avatar = $2 WHERE id = $3',
            [googleId, avatar, user.id]
          )
        }
      } else {
        // 创建新用户
        const insertResult = await db.query(
          'INSERT INTO users (username, email, google_id, avatar, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [displayName, email, googleId, avatar, 'google-oauth']
        )
        user = insertResult.rows[0]
      }
      
      // 生成 JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          email: user.email,
          username: user.username,
          avatar: user.avatar
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      )
      
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          avatar: user.avatar
        }
      }))
    } catch (err) {
      console.error('Google auth error:', err)
      response.writeHead(401, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'Authentication failed' }))
    }
  })
}

// JWT 验证辅助函数
function verifyToken(authHeader) {
  if (!authHeader) return null
  const token = authHeader.split(' ')[1]
  if (!token) return null
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch {
    return null
  }
}

// 处理文档管理 API
async function handleDocumentsAPI(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`)
  const pathParts = url.pathname.split('/')
  const docId = pathParts[3]
  
  // 验证用户
  const user = verifyToken(request.headers.authorization)
  if (!user) {
    response.writeHead(401, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'Unauthorized' }))
    return
  }
  
  try {
    // GET /api/documents - 获取文档列表
    if (!docId && request.method === 'GET') {
      const result = await db.query(
        `SELECT d.*, u.username as owner_name, u.avatar as owner_avatar
         FROM documents d 
         JOIN users u ON d.owner_id = u.id 
         WHERE d.owner_id = $1 
         ORDER BY d.updated_at DESC`,
        [user.userId]
      )
      
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        documents: result.rows.map(doc => ({
          id: doc.id,
          title: doc.title,
          ownerId: doc.owner_id,
          ownerName: doc.owner_name,
          ownerAvatar: doc.owner_avatar,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at
        }))
      }))
      return
    }
    
    // POST /api/documents - 创建新文档
    if (!docId && request.method === 'POST') {
      let body = ''
      request.on('data', chunk => body += chunk)
      request.on('end', async () => {
        try {
          const { title = 'Untitled Document' } = JSON.parse(body)
          
          const result = await db.query(
            'INSERT INTO documents (title, owner_id) VALUES ($1, $2) RETURNING *',
            [title, user.userId]
          )
          
          const doc = result.rows[0]
          response.writeHead(201, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({
            document: {
              id: doc.id,
              title: doc.title,
              ownerId: doc.owner_id,
              createdAt: doc.created_at,
              updatedAt: doc.updated_at
            }
          }))
        } catch (err) {
          response.writeHead(500, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
    
    // GET /api/documents/:id - 获取单个文档
    if (docId && request.method === 'GET') {
      const result = await db.query(
        `SELECT d.*, u.username as owner_name, u.avatar as owner_avatar
         FROM documents d 
         JOIN users u ON d.owner_id = u.id 
         WHERE d.id = $1 AND d.owner_id = $2`,
        [docId, user.userId]
      )
      
      if (result.rows.length === 0) {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'Document not found' }))
        return
      }
      
      const doc = result.rows[0]
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({
        document: {
          id: doc.id,
          title: doc.title,
          ownerId: doc.owner_id,
          ownerName: doc.owner_name,
          ownerAvatar: doc.owner_avatar,
          createdAt: doc.created_at,
          updatedAt: doc.updated_at
        }
      }))
      return
    }
    
    // PUT /api/documents/:id - 更新文档
    if (docId && request.method === 'PUT') {
      let body = ''
      request.on('data', chunk => body += chunk)
      request.on('end', async () => {
        try {
          const { title } = JSON.parse(body)
          
          const result = await db.query(
            'UPDATE documents SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND owner_id = $3 RETURNING *',
            [title, docId, user.userId]
          )
          
          if (result.rows.length === 0) {
            response.writeHead(404, { 'Content-Type': 'application/json' })
            response.end(JSON.stringify({ error: 'Document not found' }))
            return
          }
          
          const doc = result.rows[0]
          response.writeHead(200, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({
            document: {
              id: doc.id,
              title: doc.title,
              ownerId: doc.owner_id,
              createdAt: doc.created_at,
              updatedAt: doc.updated_at
            }
          }))
        } catch (err) {
          response.writeHead(500, { 'Content-Type': 'application/json' })
          response.end(JSON.stringify({ error: err.message }))
        }
      })
      return
    }
    
    // DELETE /api/documents/:id - 删除文档
    if (docId && request.method === 'DELETE') {
      const result = await db.query(
        'DELETE FROM documents WHERE id = $1 AND owner_id = $2 RETURNING *',
        [docId, user.userId]
      )
      
      if (result.rows.length === 0) {
        response.writeHead(404, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ error: 'Document not found' }))
        return
      }
      
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ message: 'Document deleted successfully' }))
      return
    }
    
    response.writeHead(404, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: 'Not found' }))
  } catch (err) {
    console.error('Documents API error:', err)
    response.writeHead(500, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({ error: err.message }))
  }
}

wss.on('connection', (ws, req) => {
  // 获取 room 名称
  const url = new URL(req.url, `http://${req.headers.host}`)
  const roomName = url.pathname.slice(1) || 'default'
  
  console.log(`WebSocket connection for room: ${roomName}`)
  
  // 使用 y-websocket 的 setupWSConnection
  setupWSConnection(ws, req, { docName: roomName, gc: true })
  
  // 延迟注册到连接管理器，确保文档已创建
  setImmediate(() => {
    const ydoc = docs.get(roomName)
    if (ydoc) {
      connectionManager.onConnect(roomName, ws, ydoc)
    } else {
      console.warn(`[Server] Document ${roomName} not found after setupWSConnection`)
    }
  })
})

server.on('upgrade', (request, socket, head) => {
  const handleAuth = ws => {
    wss.emit('connection', ws, request)
  }
  wss.handleUpgrade(request, socket, head, handleAuth)
})

// 定期同步内存中的文档到数据库（每5分钟）
const SYNC_INTERVAL = 5 * 60 * 1000 // 5分钟

setInterval(async () => {
  console.log('Running periodic sync to database...')
  const activeDocs = Array.from(docs.keys())

  for (const docName of activeDocs) {
    try {
      const ydoc = docs.get(docName)
      if (ydoc) {
        // 获取当前状态
        const state = Y.encodeStateAsUpdate(ydoc)

        // 保存到数据库
        await persistence.storeUpdate(docName, Buffer.from(state))
        console.log(`Synced document: ${docName} (${state.length} bytes)`)
      }
    } catch (err) {
      console.error(`Error syncing document ${docName}:`, err)
    }
  }

  console.log(`Periodic sync completed. Synced ${activeDocs.length} documents.`)
}, SYNC_INTERVAL)

// 优雅关闭时同步所有文档
process.on('SIGINT', async () => {
  console.log('\nShutting down server, syncing all documents...')
  const activeDocs = Array.from(docs.keys())
  
  for (const docName of activeDocs) {
    try {
      const ydoc = docs.get(docName)
      if (ydoc) {
        const state = Y.encodeStateAsUpdate(ydoc)
        await persistence.storeUpdate(docName, Buffer.from(state))
        console.log(`Synced document on shutdown: ${docName}`)
      }
    } catch (err) {
      console.error(`Error syncing document ${docName} on shutdown:`, err)
    }
  }
  
  console.log('All documents synced. Exiting.')
  process.exit(0)
})

server.listen(port, host, () => {
  console.log(`Yjs WebSocket Server running at '${host}' on port ${port}`)
  console.log(`WebSocket available at ws://${host}:${port}`)
  console.log(`Status page available at http://${host}:${port}/status`)
  console.log(`Version history API available at http://${host}:${port}/versions/{roomName}/history`)
  console.log(`Periodic sync interval: ${SYNC_INTERVAL / 1000}s`)
})
