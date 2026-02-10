const Y = require('yjs')
const db = require('./db')

/**
 * PostgreSQL-based Yjs persistence adapter
 * Stores document updates and can reconstruct the document state
 * Supports version history and rollback
 */
class PostgresPersistence {
  constructor() {
    this.docs = new Map() // Cache for loaded documents
  }

  /**
   * Get a Yjs document for a room
   * Loads from database if exists, creates new if not
   * 
   * 支持回滚功能：如果设置了 current_version_id，只加载到该版本
   */
  async getYDoc(roomName) {
    // Check cache first
    if (this.docs.has(roomName)) {
      return this.docs.get(roomName)
    }

    // Create new document
    const ydoc = new Y.Doc()

    // 检查是否有当前版本指针（回滚后设置）
    const currentVersionId = await this.getCurrentVersion(roomName)
    
    if (currentVersionId) {
      // 有版本指针：只加载到指定版本
      const updates = await this.getUpdatesUntilVersion(roomName, currentVersionId)
      updates.forEach(update => {
        try {
          Y.applyUpdate(ydoc, update)
        } catch (err) {
          console.error(`Error applying update for room ${roomName}:`, err)
        }
      })
      console.log(`Loaded document ${roomName} at version ${currentVersionId}`)
    } else {
      // 没有版本指针：加载所有更新（正常模式）
      const updates = await this.getUpdates(roomName)
      if (updates.length > 0) {
        updates.forEach(update => {
          try {
            Y.applyUpdate(ydoc, update)
          } catch (err) {
            console.error(`Error applying update for room ${roomName}:`, err)
          }
        })
      }
    }

    // Cache the document
    this.docs.set(roomName, ydoc)

    // Set up persistence on update
    ydoc.on('update', async (update) => {
      await this.storeUpdate(roomName, update)
      
      // 如果有版本指针，更新后清除它（因为产生了新版本）
      const currentVersionId = await this.getCurrentVersion(roomName)
      if (currentVersionId) {
        await this.clearCurrentVersion(roomName)
        console.log(`Cleared version pointer for ${roomName} after new update`)
      }
    })

    return ydoc
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
   */
  async storeUpdate(roomName, update) {
    try {
      await db.query(
        'INSERT INTO yjs_updates (room_name, update_data) VALUES ($1, $2)',
        [roomName, Buffer.from(update)]
      )
    } catch (err) {
      console.error(`Error storing update for room ${roomName}:`, err)
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
    } catch (err) {
      console.error(`Error clearing document cache ${roomName}:`, err)
    }
  }

  /**
   * Compact updates for a room - merge all updates into a single state update
   * This helps reduce database size
   */
  async compactDocument(roomName) {
    try {
      const ydoc = await this.getYDoc(roomName)
      const state = Y.encodeStateAsUpdate(ydoc)

      // Delete old updates
      await db.query('DELETE FROM yjs_updates WHERE room_name = $1', [roomName])

      // Store the compacted state as a single update
      await db.query(
        'INSERT INTO yjs_updates (room_name, update_data) VALUES ($1, $2)',
        [roomName, Buffer.from(state)]
      )

      console.log(`Compacted document: ${roomName}`)
    } catch (err) {
      console.error(`Error compacting document ${roomName}:`, err)
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
  async restoreSnapshot(roomName, snapshotId) {
    try {
      const result = await db.query(
        'SELECT state_data FROM document_snapshots WHERE id = $1 AND room_name = $2',
        [snapshotId, roomName]
      )
      
      if (result.rows.length === 0) {
        throw new Error(`Snapshot ${snapshotId} not found for room ${roomName}`)
      }
      
      const state = new Uint8Array(result.rows[0].state_data)
      
      // Clear cache and apply snapshot
      this.clearDocumentCache(roomName)
      
      // Delete all existing updates
      await db.query('DELETE FROM yjs_updates WHERE room_name = $1', [roomName])
      
      // Store the snapshot as the first update
      await this.storeUpdate(roomName, state)
      
      console.log(`Restored ${roomName} from snapshot ${snapshotId}`)
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
