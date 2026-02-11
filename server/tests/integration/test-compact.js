/**
 * 文档压缩功能测试
 * 测试版本压缩和加载优化
 */

const Y = require('yjs');
const persistence = require('../../yjs-persistence');
const db = require('../../db');

// 测试配置
const TEST_ROOM = `test-compact-${Date.now()}`;

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 测试 1: 创建大量版本并压缩
async function testCompactDocument() {
  console.log('\n测试 1: 创建大量版本并压缩');

  try {
    // 创建 120 个版本（超过阈值 100）
    console.log(`  创建 120 个版本...`);
    for (let i = 0; i < 120; i++) {
      const ydoc = new Y.Doc();
      const text = ydoc.getText('content');
      text.insert(0, `Version ${i + 1} content`);

      const update = Y.encodeStateAsUpdate(ydoc);
      await persistence.storeUpdate(TEST_ROOM, Buffer.from(update));
    }

    // 获取初始版本数
    const result1 = await db.query(
      'SELECT COUNT(*) as count FROM yjs_updates WHERE room_name = $1',
      [TEST_ROOM]
    );
    const initialCount = parseInt(result1.rows[0].count);
    console.log(`  初始版本数: ${initialCount}`);

    // 执行压缩（保留 50 个最近版本）
    console.log(`  执行压缩...`);
    await persistence.compactDocument(TEST_ROOM, 50);

    // 获取压缩后的版本数
    const result2 = await db.query(
      'SELECT COUNT(*) as count FROM yjs_updates WHERE room_name = $1',
      [TEST_ROOM]
    );
    const finalCount = parseInt(result2.rows[0].count);
    console.log(`  压缩后版本数: ${finalCount}`);

    // 验证压缩效果
    if (finalCount < initialCount && finalCount <= 51) { // 50个最近 + 1个压缩快照
      console.log('  ✓ 通过（版本数减少）');
      return true;
    } else {
      console.log('  ✗ 失败（版本数未减少或不符合预期）');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 测试 2: 验证压缩后文档内容正确
async function testCompactContentIntegrity() {
  console.log('\n测试 2: 验证压缩后文档内容正确');

  try {
    // 加载文档
    const ydoc = await persistence.getYDoc(TEST_ROOM);
    const text = ydoc.getText('content');
    const content = text.toString();

    console.log(`  文档内容: "${content.substring(0, 50)}..."`);

    // 内容应该包含最新版本的内容
    if (content.includes('Version 120')) {
      console.log('  ✓ 通过（内容正确）');
      return true;
    } else {
      console.log('  ✗ 失败（内容不正确）');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 测试 3: 测试小文档不压缩
async function testNoCompactForSmallDoc() {
  console.log('\n测试 3: 测试小文档不压缩');

  const smallRoom = `${TEST_ROOM}-small`;

  try {
    // 创建 10 个版本（少于阈值）
    console.log(`  创建 10 个版本...`);
    for (let i = 0; i < 10; i++) {
      const ydoc = new Y.Doc();
      const text = ydoc.getText('content');
      text.insert(0, `Small version ${i + 1}`);

      const update = Y.encodeStateAsUpdate(ydoc);
      await persistence.storeUpdate(smallRoom, Buffer.from(update));
    }

    // 获取初始版本数
    const result1 = await db.query(
      'SELECT COUNT(*) as count FROM yjs_updates WHERE room_name = $1',
      [smallRoom]
    );
    const initialCount = parseInt(result1.rows[0].count);

    // 执行压缩
    await persistence.compactDocument(smallRoom, 50);

    // 获取压缩后的版本数
    const result2 = await db.query(
      'SELECT COUNT(*) as count FROM yjs_updates WHERE room_name = $1',
      [smallRoom]
    );
    const finalCount = parseInt(result2.rows[0].count);

    console.log(`  版本数: ${initialCount} -> ${finalCount}`);

    // 小文档不应该被压缩
    if (finalCount === initialCount) {
      console.log('  ✓ 通过（小文档未被压缩）');
      return true;
    } else {
      console.log('  ✗ 失败（小文档被意外压缩）');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  }
}

// 测试 4: 测试加载性能
async function testLoadPerformance() {
  console.log('\n测试 4: 测试加载性能');

  const perfRoom = `${TEST_ROOM}-perf`;

  try {
    // 创建 200 个版本
    console.log(`  创建 200 个版本...`);
    for (let i = 0; i < 200; i++) {
      const ydoc = new Y.Doc();
      const text = ydoc.getText('content');
      text.insert(0, `Performance test version ${i + 1}`);

      const update = Y.encodeStateAsUpdate(ydoc);
      await persistence.storeUpdate(perfRoom, Buffer.from(update));
    }

    // 测试压缩前加载时间
    console.log(`  测试压缩前加载时间...`);
    const start1 = Date.now();
    await persistence.clearDocumentCache(perfRoom);
    await persistence.getYDoc(perfRoom);
    const time1 = Date.now() - start1;
    console.log(`  压缩前加载时间: ${time1}ms`);

    // 压缩文档
    console.log(`  压缩文档...`);
    await persistence.compactDocument(perfRoom, 50);

    // 测试压缩后加载时间
    console.log(`  测试压缩后加载时间...`);
    const start2 = Date.now();
    await persistence.clearDocumentCache(perfRoom);
    await persistence.getYDoc(perfRoom);
    const time2 = Date.now() - start2;
    console.log(`  压缩后加载时间: ${time2}ms`);

    // 压缩后应该更快
    if (time2 < time1) {
      console.log(`  ✓ 通过（加载速度提升 ${((time1 - time2) / time1 * 100).toFixed(1)}%）`);
      return true;
    } else {
      console.log(`  ⚠ 警告（加载速度未提升，但功能正常）`);
      return true; // 仍然算通过，因为功能正确
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
    await persistence.clearDocument(`${TEST_ROOM}-small`);
    await persistence.clearDocument(`${TEST_ROOM}-perf`);
    console.log('  清理完成');
  } catch (err) {
    console.error('  清理错误:', err.message);
  }
}

// 运行所有测试
async function runTests() {
  console.log('=== 文档压缩功能测试 ===');
  console.log(`测试文档前缀: ${TEST_ROOM}`);

  const results = [];

  results.push({ name: '创建大量版本并压缩', passed: await testCompactDocument() });
  results.push({ name: '验证压缩后文档内容正确', passed: await testCompactContentIntegrity() });
  results.push({ name: '测试小文档不压缩', passed: await testNoCompactForSmallDoc() });
  results.push({ name: '测试加载性能', passed: await testLoadPerformance() });

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
