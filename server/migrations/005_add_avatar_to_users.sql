-- 为 users 表添加 avatar 字段
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(500);

-- 添加注释
COMMENT ON COLUMN users.avatar IS '用户头像 URL';
