const express = require('express')
const persistence = require('../yjs-persistence')

const router = express.Router()

// 获取文档的版本历史
router.get('/:roomName/history', async (req, res) => {
  try {
    const { roomName } = req.params
    const { limit = 50 } = req.query

    const history = await persistence.getVersionHistory(roomName, parseInt(limit))

    res.json({
      roomName,
      versions: history.map(v => ({
        id: v.id,
        createdAt: v.created_at,
        dataSize: v.data_size
      }))
    })
  } catch (error) {
    console.error('Get version history error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 获取特定时间点的文档状态
router.get('/:roomName/at-time', async (req, res) => {
  try {
    const { roomName } = req.params
    const { timestamp } = req.query

    if (!timestamp) {
      return res.status(400).json({ error: 'Timestamp is required' })
    }

    const ydoc = await persistence.getDocumentAtTime(roomName, new Date(timestamp))
    const content = ydoc.getXmlFragment('prosemirror').toString()

    res.json({
      roomName,
      timestamp,
      content
    })
  } catch (error) {
    console.error('Get document at time error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 回滚到特定版本
router.post('/:roomName/rollback/:versionId', async (req, res) => {
  try {
    const { roomName, versionId } = req.params

    await persistence.rollbackToVersion(roomName, parseInt(versionId))

    res.json({
      message: 'Rollback successful',
      roomName,
      versionId
    })
  } catch (error) {
    console.error('Rollback error:', error)
    res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 创建命名快照
router.post('/:roomName/snapshots', async (req, res) => {
  try {
    const { roomName } = req.params
    const { name, createdBy = 'system' } = req.body

    if (!name) {
      return res.status(400).json({ error: 'Snapshot name is required' })
    }

    await persistence.createSnapshot(roomName, name, createdBy)

    res.status(201).json({
      message: 'Snapshot created successfully',
      roomName,
      snapshotName: name
    })
  } catch (error) {
    console.error('Create snapshot error:', error)
    res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// 获取所有快照
router.get('/:roomName/snapshots', async (req, res) => {
  try {
    const { roomName } = req.params

    const snapshots = await persistence.getSnapshots(roomName)

    res.json({
      roomName,
      snapshots: snapshots.map(s => ({
        id: s.id,
        name: s.snapshot_name,
        createdAt: s.created_at,
        createdBy: s.created_by
      }))
    })
  } catch (error) {
    console.error('Get snapshots error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// 从快照恢复
router.post('/:roomName/restore/:snapshotId', async (req, res) => {
  try {
    const { roomName, snapshotId } = req.params
    const createdBy = req.body.createdBy || req.user?.username || 'system'

    await persistence.restoreSnapshot(roomName, parseInt(snapshotId), createdBy)

    res.json({
      message: 'Restore successful',
      roomName,
      snapshotId
    })
  } catch (error) {
    console.error('Restore snapshot error:', error)
    res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

module.exports = router
