# 测试文件说明

## 目录结构

```
tests/
├── unit/           # 单元测试
├── integration/    # 集成测试
├── debug/          # 调试工具
└── archive/        # 归档的测试文件
```

## 单元测试 (unit/)

- `test-version-optimization.js` - 版本优化功能单元测试（Mock）
- `test-version-integration.js` - 版本优化功能集成测试（真实数据库）
- `test-persistence.js` - 持久化层测试
- `test-memory-management.js` - 内存管理测试

## 集成测试 (integration/)

- `test-client-update.js` - 客户端更新测试
- `test-server-sync.js` - 服务器同步测试
- `test-server-load.js` - 服务器负载测试
- `test-load-doc.js` - 文档加载测试

## 调试工具 (debug/)

- `test-debug.js` - 通用调试工具
- `test-analyze-update.js` - 更新分析工具
- `test-check-room.js` - 房间检查工具
- `test-check-db.js` - 数据库检查工具
- `test-check-content.js` - 内容检查工具
- `test-clear-doc.js` - 文档清理工具

## 归档 (archive/)

旧的或不再使用的测试文件

## 运行测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行单个测试
node tests/unit/test-version-optimization.js
```
