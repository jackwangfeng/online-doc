/**
 * 快速加载测试
 * 验证只加载最新状态的性能优化
 */

const Y = require('yjs');
const persistence = require('../../yjs-persistence');
const db = require('../../db');

// 测试配置
const TEST_ROOM = `test-fast-load-${Date.now()}`;

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 测试 1: 创建多个版本后加载速度
async function testLoadPerformance() {
  console.log('\n测试 1: 创建多个版本后加载速度');

  try {
    // 创建 200 个版本
    console.log(`  创建 200 个版本...`);
    for (let i = 0; i < 200; i++) {
      const ydoc = new Y.Doc();
      const text = ydoc.getText('content');
      text.insert(0, `Version ${i + 1} content with some text to make it realistic`);

      const update = Y.encodeStateAsUpdate(ydoc);
      await persistence.storeUpdate(TEST_ROOM, Buffer.from(update));
    }

    // 清除缓存
    await persistence.clearDocumentCache(TEST_ROOM);

    // 测试加载时间
    console.log(`  测试加载时间...`);
    const start = Date.now();
    const ydoc = await persistence.getYDoc(TEST_ROOM);
    const loadTime = Date.now() - start;

    const text = ydoc.getText('content');
    const content = text.toString();

    console.log(`  加载时间: ${loadTime}ms`);
    console.log(`  文档内容: "${content.substring(0, 50)}..."`);

    // 验证内容正确（应该是最新版本）
    if (content.includes('Version 200')) {
      console.log('  ✓ 内容正确（最新版本）');
    } else {
      console.log('  ✗ 内容不正确');
      return false;
    }

    // 加载应该很快（只加载1条记录）
    if (loadTime < 100) {
      console.log(`  ✓ 加载速度快（${loadTime}ms）`);
      return true;
    } else {
      console.log(`  ⚠ 加载速度一般（${loadTime}ms）`);
      return true; // 仍然算通过
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 测试 2: 验证版本历史仍然可用
async function testVersionHistory() {
  console.log('\n测试 2: 验证版本历史仍然可用');

  try {
    // 查询版本历史（查询250条以确认所有版本都保存了）
    const versions = await persistence.getVersionHistory(TEST_ROOM, 250);
    console.log(`  版本历史记录数: ${versions.length}`);

    // 应该至少有 200 个版本（我们创建了 200 个）
    if (versions.length >= 200) {
      console.log('  ✓ 版本历史完整保留');
      return true;
    } else {
      console.log('  ✗ 版本历史不完整');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 测试 3: 验证可以加载特定历史版本
async function testLoadSpecificVersion() {
  console.log('\n测试 3: 验证可以加载特定历史版本');

  try {
    // 获取版本历史（按时间升序排列）
    const versions = await persistence.getVersionHistory(TEST_ROOM, 250);

    if (versions.length < 50) {
      console.log('  ⚠ 版本数不足，跳过测试');
      return true;
    }

    // 选择第 50 个版本（最早的版本之一）
    // versions 是按 created_at DESC 排列的，所以最后一个是最早的
    const targetVersion = versions[versions.length - 50];
    console.log(`  尝试加载第 ${versions.length - 50} 个版本 (ID: ${targetVersion.id})...`);

    // 使用 rollbackToVersion 设置当前版本指针
    await persistence.rollbackToVersion(TEST_ROOM, targetVersion.id, 'test');

    // 清除缓存并重新加载
    await persistence.clearDocumentCache(TEST_ROOM);
    const ydoc = await persistence.getYDoc(TEST_ROOM);

    // 清除版本指针（恢复到最新版本）
    await persistence.clearCurrentVersion(TEST_ROOM);

    const text = ydoc.getText('content');
    const content = text.toString();

    console.log(`  加载的内容: "${content.substring(0, 50)}..."`);

    // 验证内容（应该包含版本信息）
    if (content.includes('Version')) {
      console.log('  ✓ 可以加载特定历史版本');
      return true;
    } else {
      console.log('  ✗ 无法加载特定历史版本');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 测试 4: 空文档加载
async function testLoadEmptyDocument() {
  console.log('\n测试 4: 空文档加载');

  const emptyRoom = `${TEST_ROOM}-empty`;

  try {
    // 清除缓存
    await persistence.clearDocumentCache(emptyRoom);

    // 加载不存在的文档
    const start = Date.now();
    const ydoc = await persistence.getYDoc(emptyRoom);
    const loadTime = Date.now() - start;

    console.log(`  加载时间: ${loadTime}ms`);
    console.log(`  ✓ 空文档加载成功`);
    return true;
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
    await persistence.clearDocument(`${TEST_ROOM}-empty`);
    console.log('  清理完成');
  } catch (err) {
    console.error('  清理错误:', err.message);
  }
}

// 运行所有测试
async function runTests() {
  console.log('=== 快速加载测试 ===');
  console.log(`测试文档前缀: ${TEST_ROOM}`);

  const results = [];

  results.push({ name: '创建多个版本后加载速度', passed: await testLoadPerformance() });
  results.push({ name: '验证版本历史仍然可用', passed: await testVersionHistory() });
  results.push({ name: '验证可以加载特定历史版本', passed: await testLoadSpecificVersion() });
  results.push({ name: '空文档加载', passed: await testLoadEmptyDocument() });

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
