# 数据库设置说明

## 1. 创建数据库

使用提供的 PostgreSQL 数据库信息，首先需要创建数据库：

```bash
# 连接到 PostgreSQL
psql -U quant_user -h localhost -p 5432

# 创建数据库
CREATE DATABASE doc_online_db;

# 退出
\q
```

## 2. 初始化表结构

```bash
# 连接到新创建的数据库并执行初始化脚本
psql -U quant_user -h localhost -p 5432 -d doc_online_db -f server/db/init.sql
```

## 3. 验证数据库连接

服务器启动时会自动尝试连接数据库。如果连接失败，请检查：

1. PostgreSQL 服务是否运行
2. 数据库 `doc_online_db` 是否已创建
3. 用户名和密码是否正确
4. 端口是否正确（默认 5432）

## 数据库配置

数据库连接配置在 `server/.env` 文件中：

```
DB_HOST=localhost
DB_PORT=5432
DB_USER=quant_user
DB_PASSWORD=dahuangfeng.96
DB_NAME=doc_online_db
```

## 表结构

### users 表
- id: 主键，自增
- username: 用户名，唯一
- email: 邮箱，唯一
- password_hash: 密码哈希
- created_at: 创建时间
- updated_at: 更新时间

### documents 表
- id: UUID 主键
- title: 文档标题
- owner_id: 所有者 ID（外键）
- created_at: 创建时间
- updated_at: 更新时间

### document_permissions 表
- id: 主键，自增
- document_id: 文档 ID（外键）
- user_id: 用户 ID（外键）
- permission_type: 权限类型（read/write/admin）
- created_at: 创建时间
