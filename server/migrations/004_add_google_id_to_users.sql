-- 为 users 表添加 google_id 字段，支持 Google OAuth 登录
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- 添加注释
COMMENT ON COLUMN users.google_id IS 'Google OAuth 用户 ID';
