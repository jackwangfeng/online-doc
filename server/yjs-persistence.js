const Y = require('yjs')
const db = require('./db')

/**
 * PostgreSQL-based Yjs persistence adapter
 * Stores document updates and can reconstruct the document state
 * Supports version history and rollback
 * 
 * 优化特性：
 * 1. 防抖保存 - 用户停止输入后才保存
 * 2. 版本合并 - 短时间内的更新合并成一个版本
 * 3. 内容去重 - 内容无变化不保存新版本
 */
class PostgresPersistence {
  constructor() {
    this.docs = new Map() // Cache for loaded documents
    this.updateBuffers = new Map() // 防抖缓冲区: roomName -> { updates: [], timer: null, lastSaveTime: 0 }
    this.DEBOUNCE_DELAY = 2000 // 防抖延迟: 2秒
    this.MERGE_WINDOW = 5000 // 合并窗口: 5秒内合并为一个版本
  }

  /**
   * Get a Yjs document for a room
   * Loads from database if exists, creates new if not
   * 
   * 优化：只加载最新的状态（最后保存的快照）
   * 版本历史通过 API 按需查询
   */
  async getYDoc(roomName) {
    // Check cache first
    if (this.docs.has(roomName)) {
      return this.docs.get(roomName)
    }

    // 检查是否有当前版本指针（回滚后设置）
    const currentVersionId = await this.getCurrentVersion(roomName)
    
    // 使用统一加载逻辑：快照 + 增量
    const ydoc = await this.loadDocumentWithSnapshot(roomName, currentVersionId)
    
    if (currentVersionId) {
      console.log(`Loaded document ${roomName} at version ${currentVersionId}`)
    } else {
      console.log(`Loaded latest document ${roomName}`)
    }

    // Cache the document
    this.docs.set(roomName, ydoc)

    // 设置防抖保存
    this.setupDebouncedPersistence(roomName, ydoc)

    return ydoc
  }

  /**
   * 设置防抖保存机制
   */
  setupDebouncedPersistence(roomName, ydoc) {
    // 初始化缓冲区
    if (!this.updateBuffers.has(roomName)) {
      this.updateBuffers.set(roomName, {
        updates: [],
        timer: null,
        lastSaveTime: 0,
        lastContent: null
      })
    }

    const buffer = this.updateBuffers.get(roomName)

    ydoc.on('update', async (update) => {
      // 清除之前的定时器
      if (buffer.timer) {
        clearTimeout(buffer.timer)
      }

      // 累积更新
      buffer.updates.push(update)

      // 设置新的定时器
      buffer.timer = setTimeout(async () => {
        await this.flushUpdateBuffer(roomName, ydoc)
      }, this.DEBOUNCE_DELAY)
    })
  }

  /**
   * 刷新更新缓冲区，保存到数据库
   * @param {string} roomName - 房间名称
   * @param {Y.Doc} ydoc - Yjs 文档（可选，如果不提供则从缓存中获取）
   */
  async flushUpdateBuffer(roomName, ydoc = null) {
    const buffer = this.updateBuffers.get(roomName)
    if (!buffer || buffer.updates.length === 0) return

    // 如果没有提供 ydoc，尝试从缓存获取
    if (!ydoc) {
      ydoc = this.docs.get(roomName)
    }
    
    if (!ydoc) {
      console.log(`No ydoc found for ${roomName}, flushing buffer without content check`)
      // 没有 ydoc，直接保存更新
      const mergedUpdate = Y.mergeUpdates(buffer.updates)
      await this.storeUpdate(roomName, mergedUpdate)
      buffer.updates = []
      return
    }

    // 合并所有更新
    const mergedUpdate = Y.mergeUpdates(buffer.updates)
    
    // 检查内容是否有实质变化
    const currentContent = this.extractContent(ydoc)
    if (buffer.lastContent && currentContent === buffer.lastContent) {
      console.log(`Content unchanged for ${roomName}, skipping save`)
      buffer.updates = []
      return
    }

    // 检查是否需要合并到上一个版本（时间窗口内）
    const now = Date.now()
    const timeSinceLastSave = now - buffer.lastSaveTime
    
    if (timeSinceLastSave < this.MERGE_WINDOW && buffer.lastSaveTime > 0) {
      // 合并到上一个版本
      await this.mergeWithLastUpdate(roomName, mergedUpdate)
      console.log(`Merged update into last version for ${roomName}`)
    } else {
      // 创建新版本
      await this.storeUpdate(roomName, mergedUpdate)
      console.log(`Created new version for ${roomName}`)
    }

    // 更新缓冲区状态
    buffer.lastContent = currentContent
    buffer.lastSaveTime = now
    buffer.updates = []

    // 如果有版本指针，清除它（因为产生了新版本）
    const currentVersionId = await this.getCurrentVersion(roomName)
    if (currentVersionId) {
      await this.clearCurrentVersion(roomName)
      console.log(`Cleared version pointer for ${roomName} after new update`)
    }
  }

  /**
   * 提取文档内容用于比较
   */
  extractContent(ydoc) {
    try {
      const text = ydoc.getText('content')
      return text ? text.toString() : ''
    } catch (e) {
      return ''
    }
  }

  /**
   * 合并更新到上一个版本
   */
  async mergeWithLastUpdate(roomName, newUpdate) {
    try {
      // 获取最后一个更新
      const result = await db.query(
        'SELECT id, update_data FROM yjs_updates WHERE room_name = $1 ORDER BY created_at DESC LIMIT 1',
        [roomName]
      )
      
      if (result.rows.length === 0) {
        // 没有上一个版本，直接保存
        await this.storeUpdate(roomName, newUpdate)
        return
      }

      const lastId = result.rows[0].id
      const lastUpdate = new Uint8Array(result.rows[0].update_data)
      
      // 合并更新
      const mergedUpdate = Y.mergeUpdates([lastUpdate, newUpdate])
      
      // 更新数据库中的记录
      await db.query(
        'UPDATE yjs_updates SET update_data = $1 WHERE id = $2',
        [Buffer.from(mergedUpdate), lastId]
      )
    } catch (err) {
      console.error(`Error merging update for ${roomName}:`, err)
      // 失败时直接保存为新版本
      await this.storeUpdate(roomName, newUpdate)
    }
  }

  /**
   * Get updates up to a specific version (by created_at, not id)
   */
  async getUpdatesUntilVersion(roomName, versionId) {
    try {
      // 先获取目标版本的创建时间
      const versionResult = await db.query(
        'SELECT created_at FROM yjs_updates WHERE id = $1 AND room_name = $2',
        [versionId, roomName]
      )
      
      if (versionResult.rows.length === 0) {
        console.error(`Version ${versionId} not found for ${roomName}`)
        return []
      }
      
      const targetTime = versionResult.rows[0].created_at
      
      // 按时间戳查询所有更新（包括目标版本）
      const result = await db.query(
        `SELECT update_data FROM yjs_updates 
         WHERE room_name = $1 
         AND created_at <= $2
         ORDER BY created_at ASC`,
        [roomName, targetTime]
      )
      return result.rows.map(row => new Uint8Array(row.update_data))
    } catch (err) {
      console.error(`Error getting updates until version for ${roomName}:`, err)
      return []
    }
  }

  /**
   * Clear current version pointer
   */
  async clearCurrentVersion(roomName) {
    try {
      await db.query(
        'DELETE FROM document_current_version WHERE room_name = $1',
        [roomName]
      )
    } catch (err) {
      console.error(`Error clearing current version for ${roomName}:`, err)
    }
  }

  /**
   * Store an update in the database
   * 每 50 个版本自动创建快照（单独插入一条快照记录）
   */
  async storeUpdate(roomName, update) {
    try {
      // 插入更新
      const result = await db.query(
        'INSERT INTO yjs_updates (room_name, update_data, is_snapshot) VALUES ($1, $2, FALSE) RETURNING id, created_at',
        [roomName, Buffer.from(update)]
      )
      
      const updateId = result.rows[0].id
      
      // 检查是否需要创建快照（每 50 个版本）
      const countResult = await db.query(
        'SELECT COUNT(*) as count FROM yjs_updates WHERE room_name = $1',
        [roomName]
      )
      const versionCount = parseInt(countResult.rows[0].count)
      
      // 每 50 个版本创建快照
      if (versionCount % 50 === 0) {
        await this.createSnapshotRecord(roomName, updateId)
      }
      
      return updateId
    } catch (err) {
      console.error(`Error storing update for room ${roomName}:`, err)
      throw err
    }
  }
  
  /**
   * 创建快照记录（单独插入一条完整状态记录）
   * @param {string} roomName - 房间名称
   * @param {number} afterUpdateId - 在该更新之后创建快照
   */
  async createSnapshotRecord(roomName, afterUpdateId) {
    try {
      console.log(`Creating snapshot for ${roomName} after version ${afterUpdateId}`)
      
      // 获取当前完整状态（使用 loadDocumentWithSnapshot 加载）
      const tempDoc = await this.loadDocumentWithSnapshot(roomName, afterUpdateId)
      
      // 生成完整状态
      const snapshot = Y.encodeStateAsUpdate(tempDoc)
      
      // 插入快照记录（作为新的记录，标记为快照）
      await db.query(
        'INSERT INTO yjs_updates (room_name, update_data, is_snapshot) VALUES ($1, $2, TRUE)',
        [roomName, Buffer.from(snapshot)]
      )
      
      console.log(`Snapshot created for ${roomName} after version ${afterUpdateId} (${snapshot.length} bytes)`)
    } catch (err) {
      console.error(`Error creating snapshot for ${roomName}:`, err)
    }
  }

  /**
   * Get all updates for a room
   */
  async getUpdates(roomName) {
    try {
      const result = await db.query(
        'SELECT update_data FROM yjs_updates WHERE room_name = $1 ORDER BY created_at ASC',
        [roomName]
      )
      return result.rows.map(row => new Uint8Array(row.update_data))
    } catch (err) {
      console.error(`Error getting updates for room ${roomName}:`, err)
      return []
    }
  }

  /**
   * Get the latest update for a room (for fast loading)
   * @param {string} roomName - 房间名称
   * @returns {Uint8Array|null} 最新的更新数据
   */
  async getLatestUpdate(roomName) {
    try {
      const result = await db.query(
        'SELECT update_data FROM yjs_updates WHERE room_name = $1 ORDER BY created_at DESC LIMIT 1',
        [roomName]
      )
      if (result.rows.length > 0) {
        return new Uint8Array(result.rows[0].update_data)
      }
      return null
    } catch (err) {
      console.error(`Error getting latest update for room ${roomName}:`, err)
      return null
    }
  }

  /**
   * Get the current state of a document as Uint8Array
   */
  async getStateAsUpdate(roomName) {
    const ydoc = await this.getYDoc(roomName)
    return Y.encodeStateAsUpdate(ydoc)
  }

  /**
   * Clear all updates for a room (useful for cleanup)
   */
  async clearDocument(roomName) {
    try {
      await db.query('DELETE FROM yjs_updates WHERE room_name = $1', [roomName])
      this.docs.delete(roomName)
      this.updateBuffers.delete(roomName)
    } catch (err) {
      console.error(`Error clearing document ${roomName}:`, err)
    }
  }

  /**
   * Clear only the in-memory cache for a room
   * Keeps the database data intact
   */
  clearDocumentCache(roomName) {
    try {
      if (this.docs.has(roomName)) {
        const ydoc = this.docs.get(roomName)
        // Clean up event listeners
        ydoc.off('update')
        this.docs.delete(roomName)
        console.log(`Cleared cache for room ${roomName}`)
      }
      // 清除缓冲区
      if (this.updateBuffers.has(roomName)) {
        const buffer = this.updateBuffers.get(roomName)
        if (buffer.timer) {
          clearTimeout(buffer.timer)
        }
        this.updateBuffers.delete(roomName)
      }
    } catch (err) {
      console.error(`Error clearing document cache ${roomName}:`, err)
    }
  }

  // ==================== 快照加载管理 ====================

  /**
   * 统一加载逻辑：从快照加载 + 增量更新
   * @param {string} roomName - 房间名称
   * @param {number|null} targetVersionId - 目标版本ID（null表示最新版本）
   * @returns {Y.Doc} 加载的文档
   */
  async loadDocumentWithSnapshot(roomName, targetVersionId = null) {
    const ydoc = new Y.Doc()

    try {
      // 1. 确定目标版本
      let targetId = targetVersionId
      if (!targetId) {
        // 获取最新版本ID
        const latestResult = await db.query(
          'SELECT id FROM yjs_updates WHERE room_name = $1 ORDER BY created_at DESC LIMIT 1',
          [roomName]
        )
        if (latestResult.rows.length === 0) {
          return ydoc // 空文档
        }
        targetId = latestResult.rows[0].id
      }

      // 2. 找到目标版本之前的最新快照
      const snapshotResult = await db.query(
        `SELECT id, update_data FROM yjs_updates 
         WHERE room_name = $1 
         AND is_snapshot = TRUE 
         AND id <= $2
         ORDER BY id DESC 
         LIMIT 1`,
        [roomName, targetId]
      )

      let startId = 0

      if (snapshotResult.rows.length > 0) {
        // 3. 加载快照
        const snapshot = snapshotResult.rows[0]
        Y.applyUpdate(ydoc, new Uint8Array(snapshot.update_data))
        startId = snapshot.id
        console.log(`Loaded snapshot for ${roomName} (id: ${startId}), target: ${targetId}`)
      }

      // 4. 加载快照到目标版本的增量更新
      const updatesResult = await db.query(
        `SELECT update_data FROM yjs_updates 
         WHERE room_name = $1 
         AND id > $2 
         AND id <= $3
         AND is_snapshot = FALSE
         ORDER BY id ASC`,
        [roomName, startId, targetId]
      )

      updatesResult.rows.forEach(row => {
        try {
          Y.applyUpdate(ydoc, new Uint8Array(row.update_data))
        } catch (err) {
          console.error(`Error applying incremental update for ${roomName}:`, err)
        }
      })

      console.log(`Loaded ${updatesResult.rows.length} incremental updates for ${roomName}`)

      return ydoc
    } catch (err) {
      console.error(`Error loading document ${roomName} with snapshot:`, err)
      return ydoc
    }
  }

  // ==================== 版本历史管理 ====================

  /**
   * Get version history for a room
   * Returns array of version snapshots at different points in time
   */
  async getVersionHistory(roomName, limit = 50) {
    try {
      const result = await db.query(
        `SELECT 
          id, 
          room_name, 
          created_at,
          LENGTH(update_data) as data_size
        FROM yjs_updates 
        WHERE room_name = $1 
        ORDER BY created_at DESC 
        LIMIT $2`,
        [roomName, limit]
      )
      return result.rows
    } catch (err) {
      console.error(`Error getting version history for ${roomName}:`, err)
      return []
    }
  }

  /**
   * Get document state at a specific point in time
   * Reconstructs document by applying updates up to that timestamp
   */
  async getDocumentAtTime(roomName, timestamp) {
    try {
      const result = await db.query(
        'SELECT update_data FROM yjs_updates WHERE room_name = $1 AND created_at <= $2 ORDER BY created_at ASC',
        [roomName, timestamp]
      )
      
      const ydoc = new Y.Doc()
      result.rows.forEach(row => {
        try {
          Y.applyUpdate(ydoc, new Uint8Array(row.update_data))
        } catch (err) {
          console.error(`Error applying update for ${roomName}:`, err)
        }
      })
      
      return ydoc
    } catch (err) {
      console.error(`Error getting document at time for ${roomName}:`, err)
      return new Y.Doc()
    }
  }

  /**
   * Rollback to a specific version by ID
   * 
   * 业界标准方案（腾讯文档/Google文档模式）：
   * 
   * 原理：
   * 1. 记录当前激活的版本 ID（current_version_id）
   * 2. 回滚时更新 current_version_id 指向目标版本
   * 3. 所有历史版本保留，可随时查看和恢复
   * 4. 继续编辑时，基于回滚后的版本创建新更新
   * 
   * 效果：
   * - 时间线：V1 → V2 → V3 → V4 → V5
   * - 回滚到 V3：current_version = V3
   * - 历史仍显示 V1-V5，但当前文档内容是 V3
   * - 继续编辑：V3 → V6（新版本）
   */
  async rollbackToVersion(roomName, versionId, createdBy = 'system') {
    try {
      // Step 1: 验证目标版本存在
      const versionResult = await db.query(
        'SELECT id FROM yjs_updates WHERE id = $1 AND room_name = $2',
        [versionId, roomName]
      )
      
      if (versionResult.rows.length === 0) {
        throw new Error(`Version ${versionId} not found for room ${roomName}`)
      }
      
      // Step 2: 更新当前版本指针
      await db.query(
        `INSERT INTO document_current_version (room_name, current_version_id, updated_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (room_name) 
         DO UPDATE SET current_version_id = $2, updated_at = CURRENT_TIMESTAMP`,
        [roomName, versionId]
      )
      
      // Step 3: 清除内存缓存，强制重新加载
      this.clearDocumentCache(roomName)
      
      console.log(`Rolled back ${roomName} to version ${versionId}`)
      
      return {
        success: true,
        currentVersionId: versionId,
        requiresReconnect: true,
        message: 'Rollback completed. The document has been restored to the selected version.'
      }
    } catch (err) {
      console.error(`Error rolling back ${roomName} to version ${versionId}:`, err)
      throw err
    }
  }

  /**
   * Get current active version for a room
   */
  async getCurrentVersion(roomName) {
    try {
      const result = await db.query(
        'SELECT current_version_id FROM document_current_version WHERE room_name = $1',
        [roomName]
      )
      return result.rows.length > 0 ? result.rows[0].current_version_id : null
    } catch (err) {
      console.error(`Error getting current version for ${roomName}:`, err)
      return null
    }
  }

  /**
   * Create a named snapshot of the current document state
   */
  async createSnapshot(roomName, snapshotName, createdBy = 'system') {
    try {
      const ydoc = await this.getYDoc(roomName)
      const state = Y.encodeStateAsUpdate(ydoc)
      
      await db.query(
        `INSERT INTO document_snapshots (room_name, snapshot_name, state_data, created_by) 
         VALUES ($1, $2, $3, $4)`,
        [roomName, snapshotName, Buffer.from(state), createdBy]
      )
      
      console.log(`Created snapshot '${snapshotName}' for ${roomName}`)
      return true
    } catch (err) {
      console.error(`Error creating snapshot for ${roomName}:`, err)
      throw err
    }
  }

  /**
   * Get all snapshots for a room
   */
  async getSnapshots(roomName) {
    try {
      const result = await db.query(
        `SELECT id, snapshot_name, created_at, created_by 
         FROM document_snapshots 
         WHERE room_name = $1 
         ORDER BY created_at DESC`,
        [roomName]
      )
      return result.rows
    } catch (err) {
      console.error(`Error getting snapshots for ${roomName}:`, err)
      return []
    }
  }

  /**
   * Restore from a named snapshot
   */
  async restoreSnapshot(roomName, snapshotId, createdBy = 'system') {
    try {
      const result = await db.query(
        'SELECT state_data, snapshot_name FROM document_snapshots WHERE id = $1 AND room_name = $2',
        [snapshotId, roomName]
      )
      
      if (result.rows.length === 0) {
        throw new Error(`Snapshot ${snapshotId} not found for room ${roomName}`)
      }
      
      const state = new Uint8Array(result.rows[0].state_data)
      const snapshotName = result.rows[0].snapshot_name
      
      // Clear cache and apply snapshot
      this.clearDocumentCache(roomName)
      
      // Store the snapshot as a new update (preserve history)
      await this.storeUpdate(roomName, state)
      
      // Also create a new version entry to track this restore operation
      await db.query(
        `INSERT INTO document_versions (room_name, update_data, data_size, created_by, is_current)
         VALUES ($1, $2, $3, $4, true)`,
        [roomName, Buffer.from(state), state.length, createdBy]
      )
      
      console.log(`Restored ${roomName} from snapshot ${snapshotId} (${snapshotName})`)
      return true
    } catch (err) {
      console.error(`Error restoring snapshot for ${roomName}:`, err)
      throw err
    }
  }
}

// Singleton instance
const persistence = new PostgresPersistence()

module.exports = persistence
