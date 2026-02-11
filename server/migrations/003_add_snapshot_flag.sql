-- 添加 is_snapshot 字段到 yjs_updates 表
-- 用于标记哪些更新是快照（完整状态）

-- 添加字段
ALTER TABLE yjs_updates 
ADD COLUMN IF NOT EXISTS is_snapshot BOOLEAN DEFAULT FALSE;

-- 创建索引加速快照查询
CREATE INDEX IF NOT EXISTS idx_yjs_updates_snapshot 
ON yjs_updates(room_name, is_snapshot, created_at);

-- 创建索引加速版本查询
CREATE INDEX IF NOT EXISTS idx_yjs_updates_room_created 
ON yjs_updates(room_name, created_at);
