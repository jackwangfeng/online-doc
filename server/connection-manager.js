/**
 * 文档连接管理器
 * 跟踪每个文档的客户端连接数，当没有连接时自动归档并释放内存
 */

const Y = require('yjs')
const persistence = require('./yjs-persistence')
const { docs } = require('y-websocket/bin/utils')

class ConnectionManager {
  constructor() {
    // 记录每个文档的连接数: roomName -> Set<ws>
    this.connections = new Map()
    // 记录文档加载时的初始状态（用于判断是否有变化）
    this.docInitialStates = new Map()
    // 归档检查延迟（毫秒）
    this.ARCHIVE_DELAY = 5000
    // 归档定时器
    this.archiveTimers = new Map()
    // 保存文档引用，防止 y-websocket 删除后无法访问
    this.docRefs = new Map()
  }

  /**
   * 客户端连接到文档
   * @param {string} roomName - 文档名称
   * @param {WebSocket} ws - WebSocket 连接
   * @param {Y.Doc} ydoc - Yjs 文档
   */
  async onConnect(roomName, ws, ydoc) {
    // 初始化连接集合
    if (!this.connections.has(roomName)) {
      this.connections.set(roomName, new Set())
      
      // 保存文档引用
      this.docRefs.set(roomName, ydoc)
      
      // 记录文档初始状态（用于后续比较是否有变化）
      const initialState = Y.encodeStateAsUpdate(ydoc)
      this.docInitialStates.set(roomName, Buffer.from(initialState))
      
      console.log(`[ConnectionManager] First connection to ${roomName}, recorded initial state (${initialState.length} bytes)`)
    }
    
    // 添加连接到集合
    this.connections.get(roomName).add(ws)
    
    // 清除可能存在的归档定时器
    if (this.archiveTimers.has(roomName)) {
      clearTimeout(this.archiveTimers.get(roomName))
      this.archiveTimers.delete(roomName)
      console.log(`[ConnectionManager] Cancelled archive timer for ${roomName} (new connection)`)
    }
    
    const count = this.connections.get(roomName).size
    console.log(`[ConnectionManager] Client connected to ${roomName}, total connections: ${count}`)
    
    // 监听连接关闭
    ws.on('close', () => {
      this.onDisconnect(roomName, ws)
    })
    
    // 监听错误
    ws.on('error', (err) => {
      console.error(`[ConnectionManager] WebSocket error for ${roomName}:`, err)
      this.onDisconnect(roomName, ws)
    })
  }

  /**
   * 客户端断开连接
   * @param {string} roomName - 文档名称
   * @param {WebSocket} ws - WebSocket 连接
   */
  onDisconnect(roomName, ws) {
    const connections = this.connections.get(roomName)
    if (!connections) return
    
    // 移除连接
    connections.delete(ws)
    const count = connections.size
    
    console.log(`[ConnectionManager] Client disconnected from ${roomName}, remaining connections: ${count}`)
    
    // 如果没有连接了，启动归档定时器
    if (count === 0) {
      console.log(`[ConnectionManager] No more connections to ${roomName}, scheduling archive in ${this.ARCHIVE_DELAY}ms`)
      
      const timer = setTimeout(async () => {
        await this.archiveDocument(roomName)
      }, this.ARCHIVE_DELAY)
      
      this.archiveTimers.set(roomName, timer)
    }
  }

  /**
   * 归档文档
   * 如果有变化则保存，然后释放内存
   * @param {string} roomName - 文档名称
   */
  async archiveDocument(roomName) {
    console.log(`[ConnectionManager] Archiving document: ${roomName}`)

    try {
      // 优先使用保存的文档引用（因为 y-websocket 可能会删除 docs 中的文档）
      let ydoc = this.docRefs.get(roomName) || docs.get(roomName)
      
      if (!ydoc) {
        console.log(`[ConnectionManager] Document ${roomName} not found, skipping archive`)
        this.cleanup(roomName)
        return
      }

      // 首先，确保 persistence 中的防抖保存已经完成
      // 刷新 persistence 的缓冲区
      console.log(`[ConnectionManager] Flushing update buffer for ${roomName}`)
      await persistence.flushUpdateBuffer(roomName)

      // 获取当前状态
      const currentState = Y.encodeStateAsUpdate(ydoc)
      const initialState = this.docInitialStates.get(roomName)

      // 比较是否有变化
      const hasChanges = !initialState ||
                         currentState.length !== initialState.length ||
                         !currentState.every((byte, i) => byte === initialState[i])

      if (hasChanges) {
        console.log(`[ConnectionManager] Document ${roomName} has changes, saving to database (${currentState.length} bytes)`)

        // 保存到数据库
        await persistence.storeUpdate(roomName, Buffer.from(currentState))
        console.log(`[ConnectionManager] Document ${roomName} saved successfully`)
      } else {
        console.log(`[ConnectionManager] Document ${roomName} has no changes, skipping save`)
      }

      // 释放内存
      await this.releaseDocument(roomName)

    } catch (err) {
      console.error(`[ConnectionManager] Error archiving document ${roomName}:`, err)
    } finally {
      this.cleanup(roomName)
    }
  }

  /**
   * 释放文档内存
   * @param {string} roomName - 文档名称
   */
  async releaseDocument(roomName) {
    console.log(`[ConnectionManager] Releasing document from memory: ${roomName}`)
    
    // 从 y-websocket 的 docs 中移除
    if (docs.has(roomName)) {
      docs.delete(roomName)
    }
    
    // 从 persistence 的缓存中移除
    await persistence.clearDocumentCache(roomName)
    
    console.log(`[ConnectionManager] Document ${roomName} released from memory`)
  }

  /**
   * 清理管理器状态
   * @param {string} roomName - 文档名称
   */
  cleanup(roomName) {
    this.connections.delete(roomName)
    this.docInitialStates.delete(roomName)
    this.archiveTimers.delete(roomName)
    this.docRefs.delete(roomName)
  }

  /**
   * 获取文档连接数
   * @param {string} roomName - 文档名称
   * @returns {number} 连接数
   */
  getConnectionCount(roomName) {
    const connections = this.connections.get(roomName)
    return connections ? connections.size : 0
  }

  /**
   * 获取所有活跃文档的连接统计
   * @returns {Object} 统计信息
   */
  getStats() {
    const stats = {}
    for (const [roomName, connections] of this.connections.entries()) {
      stats[roomName] = connections.size
    }
    return stats
  }
}

// 导出单例
module.exports = new ConnectionManager()
