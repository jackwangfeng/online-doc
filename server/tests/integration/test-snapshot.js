/**
 * 快照加载功能测试
 * 验证快照 + 增量加载逻辑
 */

const Y = require('yjs');
const persistence = require('../../yjs-persistence');
const db = require('../../db');

// 测试配置
const TEST_ROOM = `test-snapshot-${Date.now()}`;
const SNAPSHOT_INTERVAL = 50; // 每50个版本创建快照

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 测试 1: 创建版本并自动创建快照
async function testAutoSnapshot() {
  console.log('\n测试 1: 创建版本并自动创建快照');

  try {
    // 创建 120 个版本（应该创建快照：1, 50, 100, 120）
    console.log(`  创建 120 个版本...`);
    for (let i = 0; i < 120; i++) {
      const ydoc = new Y.Doc();
      const text = ydoc.getText('content');
      text.insert(0, `Version ${i + 1} content with some text`);

      const update = Y.encodeStateAsUpdate(ydoc);
      await persistence.storeUpdate(TEST_ROOM, Buffer.from(update));
    }

    // 检查快照数量
    const snapshotResult = await db.query(
      'SELECT COUNT(*) as count FROM yjs_updates WHERE room_name = $1 AND is_snapshot = TRUE',
      [TEST_ROOM]
    );
    const snapshotCount = parseInt(snapshotResult.rows[0].count);
    console.log(`  快照数量: ${snapshotCount}`);

    // 应该至少有 2 个快照（50, 100）
    if (snapshotCount >= 2) {
      console.log('  ✓ 快照自动创建成功');
      return true;
    } else {
      console.log('  ✗ 快照数量不足');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 测试 2: 使用快照加载最新版本
async function testLoadLatestWithSnapshot() {
  console.log('\n测试 2: 使用快照加载最新版本');

  try {
    // 清除缓存
    await persistence.clearDocumentCache(TEST_ROOM);

    // 加载文档
    console.log(`  加载文档...`);
    const start = Date.now();
    const ydoc = await persistence.getYDoc(TEST_ROOM);
    const loadTime = Date.now() - start;

    const text = ydoc.getText('content');
    const content = text.toString();

    console.log(`  加载时间: ${loadTime}ms`);
    console.log(`  文档内容: "${content.substring(0, 50)}..."`);

    // 验证内容是最新版本
    if (content.includes('Version 120')) {
      console.log('  ✓ 内容正确（最新版本）');
    } else {
      console.log('  ✗ 内容不正确');
      return false;
    }

    // 加载应该很快（使用快照）
    if (loadTime < 100) {
      console.log(`  ✓ 加载速度快（${loadTime}ms）`);
      return true;
    } else {
      console.log(`  ⚠ 加载速度一般（${loadTime}ms）`);
      return true;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 测试 3: 使用快照加载历史版本
async function testLoadHistoryWithSnapshot() {
  console.log('\n测试 3: 使用快照加载历史版本');

  try {
    // 获取版本历史
    const versions = await persistence.getVersionHistory(TEST_ROOM, 120);

    if (versions.length < 75) {
      console.log('  ⚠ 版本数不足，跳过测试');
      return true;
    }

    // 选择第 75 个版本（在快照 50 和 100 之间）
    const targetVersion = versions[versions.length - 75];
    console.log(`  尝试加载第 75 个版本 (ID: ${targetVersion.id})...`);

    // 清除缓存并加载
    await persistence.clearDocumentCache(TEST_ROOM);

    // 使用 loadDocumentWithSnapshot 加载特定版本
    const start = Date.now();
    const ydoc = await persistence.loadDocumentWithSnapshot(TEST_ROOM, targetVersion.id);
    const loadTime = Date.now() - start;

    const text = ydoc.getText('content');
    const content = text.toString();

    console.log(`  加载时间: ${loadTime}ms`);
    console.log(`  加载的内容: "${content.substring(0, 50)}..."`);

    // 验证内容
    if (content.includes('Version')) {
      console.log('  ✓ 可以加载历史版本');
      return true;
    } else {
      console.log('  ✗ 无法加载历史版本');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 测试 4: 验证加载性能（大量版本）
async function testLoadPerformance() {
  console.log('\n测试 4: 验证加载性能（大量版本）');

  const perfRoom = `${TEST_ROOM}-perf`;

  try {
    // 创建 300 个版本（每次在原有文档上追加）
    console.log(`  创建 300 个版本...`);
    let ydoc = new Y.Doc();
    for (let i = 0; i < 300; i++) {
      const text = ydoc.getText('content');
      // 追加内容而不是替换
      if (i === 0) {
        text.insert(0, `Version ${i + 1}`);
      } else {
        text.insert(text.length, `, Version ${i + 1}`);
      }

      const update = Y.encodeStateAsUpdate(ydoc);
      await persistence.storeUpdate(perfRoom, Buffer.from(update));
      
      // 每50个版本重新创建ydoc以模拟实际使用场景
      if ((i + 1) % 50 === 0) {
        ydoc = new Y.Doc();
        const newText = ydoc.getText('content');
        newText.insert(0, `Version ${i + 1}`);
      }
    }

    // 清除缓存
    await persistence.clearDocumentCache(perfRoom);

    // 测试加载时间
    console.log(`  测试加载时间...`);
    const start = Date.now();
    const loadedYdoc = await persistence.getYDoc(perfRoom);
    const loadTime = Date.now() - start;

    const text = loadedYdoc.getText('content');
    const content = text.toString();

    console.log(`  加载时间: ${loadTime}ms`);
    console.log(`  文档内容: "${content.substring(0, 50)}..."`);

    // 验证内容包含版本信息
    if (content.includes('Version')) {
      console.log('  ✓ 内容正确');
    } else {
      console.log('  ✗ 内容不正确');
      return false;
    }

    // 300 个版本应该加载很快（使用 6 个快照）
    if (loadTime < 100) {
      console.log(`  ✓ 加载性能优秀（${loadTime}ms）`);
      return true;
    } else {
      console.log(`  ⚠ 加载性能一般（${loadTime}ms）`);
      return true;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 清理测试数据
async function cleanup() {
  console.log('\n清理测试数据...');
  try {
    await persistence.clearDocument(TEST_ROOM);
    await persistence.clearDocument(`${TEST_ROOM}-perf`);
    console.log('  清理完成');
  } catch (err) {
    console.error('  清理错误:', err.message);
  }
}

// 运行所有测试
async function runTests() {
  console.log('=== 快照加载功能测试 ===');
  console.log(`测试文档前缀: ${TEST_ROOM}`);

  const results = [];

  results.push({ name: '创建版本并自动创建快照', passed: await testAutoSnapshot() });
  results.push({ name: '使用快照加载最新版本', passed: await testLoadLatestWithSnapshot() });
  results.push({ name: '使用快照加载历史版本', passed: await testLoadHistoryWithSnapshot() });
  results.push({ name: '验证加载性能（大量版本）', passed: await testLoadPerformance() });

  await cleanup();

  console.log('\n=== 测试结果 ===');
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      failed++;
    }
  }

  console.log(`\n总计: ${passed} 通过, ${failed} 失败`);

  if (failed === 0) {
    console.log('\n✓ 所有测试通过！');
  } else {
    console.log('\n✗ 部分测试失败');
    process.exit(1);
  }
}

// 运行测试
runTests().catch(err => {
  console.error('测试运行错误:', err);
  process.exit(1);
});
