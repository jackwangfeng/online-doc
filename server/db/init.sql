-- 创建数据库（如果不存在）
-- 注意：需要在 postgres 数据库中运行此命令
-- CREATE DATABASE doc_online_db;

-- 连接到新数据库后运行以下脚本

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 文档表
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL DEFAULT 'Untitled Document',
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 文档权限表（用于未来的协作功能）
CREATE TABLE IF NOT EXISTS document_permissions (
    id SERIAL PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_type VARCHAR(20) NOT NULL DEFAULT 'read', -- 'read', 'write', 'admin'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, user_id)
);

-- Yjs文档更新表（用于持久化）
CREATE TABLE IF NOT EXISTS yjs_updates (
    id SERIAL PRIMARY KEY,
    room_name VARCHAR(255) NOT NULL,
    update_data BYTEA NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_permissions_doc ON document_permissions(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_permissions_user ON document_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_yjs_updates_room ON yjs_updates(room_name);
CREATE INDEX IF NOT EXISTS idx_yjs_updates_created ON yjs_updates(created_at);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
