-- 创建当前版本表，记录每个房间的当前激活版本
-- 类似于腾讯文档/Google文档的回滚机制
CREATE TABLE IF NOT EXISTS document_current_version (
  id SERIAL PRIMARY KEY,
  room_name VARCHAR(255) UNIQUE NOT NULL,
  current_version_id INTEGER,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_document_current_version_room ON document_current_version(room_name);

-- 添加注释
COMMENT ON TABLE document_current_version IS '记录每个文档房间的当前激活版本，用于实现回滚功能';
