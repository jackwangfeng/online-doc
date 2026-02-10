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

const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 3000

// 自定义持久化层
const customPersistence = {
  provider: persistence,
  bindState: async (docName, ydoc) => {
    // 检查是否有版本指针（回滚后设置）
    const currentVersionId = await persistence.getCurrentVersion(docName)
    
    let updates
    if (currentVersionId) {
      // 回滚模式：只加载到指定版本
      updates = await persistence.getUpdatesUntilVersion(docName, currentVersionId)
      console.log(`Loading ${updates.length} updates for room: ${docName} (rolled back to version ${currentVersionId})`)
    } else {
      // 正常模式：加载所有更新
      updates = await persistence.getUpdates(docName)
      console.log(`Loading ${updates.length} updates for room: ${docName}`)
    }
    
    if (updates.length > 0) {
      updates.forEach(update => {
        try {
          Y.applyUpdate(ydoc, update)
        } catch (err) {
          console.error(`Error applying update for ${docName}:`, err)
        }
      })
    }
    
    // 监听更新并保存到数据库
    ydoc.on('update', async (update, origin) => {
      await persistence.storeUpdate(docName, Buffer.from(update))
      
      // 如果有版本指针，更新后清除它
      const versionId = await persistence.getCurrentVersion(docName)
      if (versionId) {
        await persistence.clearCurrentVersion(docName)
        console.log(`Cleared version pointer for ${docName} after new update`)
      }
    })
  },
  writeState: async (docName, ydoc) => {
    console.log(`Persisting document: ${docName}`)
    return true
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
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify({
      status: 'running',
      activeDocuments: activeDocs.length,
      documents: activeDocs
    }, null, 2))
    return
  }
  
  // 版本历史 API 路由
  if (request.url.startsWith('/versions/')) {
    handleVersionsAPI(request, response)
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

wss.on('connection', (ws, req) => {
  // 获取 room 名称
  const url = new URL(req.url, `http://${req.headers.host}`)
  const roomName = url.pathname.slice(1) || 'default'
  
  console.log(`WebSocket connection for room: ${roomName}`)
  
  // 使用 y-websocket 的 setupWSConnection
  setupWSConnection(ws, req, { docName: roomName, gc: true })
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
