/**
 * 版本优化功能集成测试
 * 直接测试真实的数据库和服务器
 * 
 * 注意：这个测试直接调用 yjs-persistence.js 的 API，
 * 不通过 WebSocket，以确保测试的是实际的数据库操作
 */

const Y = require('yjs');
const db = require('../../db');
const persistence = require('../../yjs-persistence');

// 测试配置
const TEST_ROOM_PREFIX = `test-version-opt-${Date.now()}`;
const DEBOUNCE_DELAY = 2500; // 2.5秒（比服务器的2秒稍长）
const MERGE_WINDOW = 6000; // 6秒（比服务器的5秒稍长）

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 获取版本数量
async function getVersionCount(roomName) {
  const result = await db.query(
    'SELECT COUNT(*) as count FROM yjs_updates WHERE room_name = $1',
    [roomName]
  );
  return parseInt(result.rows[0].count);
}

// 清理测试数据
async function cleanup(roomName) {
  await db.query('DELETE FROM yjs_updates WHERE room_name = $1', [roomName]);
  console.log(`  已清理测试数据: ${roomName}`);
}

// 测试套件
async function runTests() {
  console.log('=== 版本优化功能集成测试 ===');
  console.log(`测试前缀: ${TEST_ROOM_PREFIX}`);
  console.log(`防抖延迟: ${DEBOUNCE_DELAY}ms`);
  console.log(`合并窗口: ${MERGE_WINDOW}ms\n`);
  
  let passed = 0;
  let failed = 0;

  // 测试1: 防抖保存
  console.log('测试1: 防抖保存 - 快速输入应该只产生1个版本');
  try {
    const testRoom = `${TEST_ROOM_PREFIX}-debounce`;
    await cleanup(testRoom);
    
    // 获取 Yjs 文档（会自动设置防抖）
    const ydoc = await persistence.getYDoc(testRoom);
    const text = ydoc.getText('content');
    
    // 快速输入10次
    console.log('  开始快速输入...');
    for (let i = 0; i < 10; i++) {
      text.insert(text.length, `a`);
      await sleep(100); // 100ms间隔
    }
    
    // 等待防抖时间
    console.log(`  等待 ${DEBOUNCE_DELAY}ms 防抖时间...`);
    await sleep(DEBOUNCE_DELAY);
    
    // 再等待一点时间确保保存完成
    await sleep(500);
    
    const count = await getVersionCount(testRoom);
    console.log(`  快速输入10次，产生版本数: ${count}`);
    
    if (count === 1) {
      console.log('  ✓ 通过\n');
      passed++;
    } else {
      console.log(`  ✗ 失败: 期望1个版本，实际${count}个\n`);
      failed++;
    }
    
    // 清理缓存
    persistence.clearDocumentCache(testRoom);
    await cleanup(testRoom);
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
    console.error(e);
    failed++;
  }

  // 测试2: 版本合并
  console.log('测试2: 版本合并 - 5秒内输入应该合并到1个版本');
  try {
    const testRoom = `${TEST_ROOM_PREFIX}-merge`;
    await cleanup(testRoom);
    
    const ydoc = await persistence.getYDoc(testRoom);
    const text = ydoc.getText('content');
    
    // 第一次输入
    console.log('  第一次输入...');
    text.insert(0, 'Hello');
    await sleep(DEBOUNCE_DELAY + 500);
    
    const count1 = await getVersionCount(testRoom);
    console.log(`  第一次输入后版本数: ${count1}`);
    
    // 5秒内第二次输入
    console.log('  5秒内第二次输入...');
    text.insert(text.length, ' World');
    await sleep(DEBOUNCE_DELAY + 500);
    
    const count2 = await getVersionCount(testRoom);
    console.log(`  第二次输入后版本数: ${count2}`);
    
    if (count2 === 1) {
      console.log('  ✓ 通过（合并到1个版本）\n');
      passed++;
    } else {
      console.log(`  ✗ 失败: 期望1个版本，实际${count2}个\n`);
      failed++;
    }
    
    persistence.clearDocumentCache(testRoom);
    await cleanup(testRoom);
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
    console.error(e);
    failed++;
  }

  // 测试3: 超过合并窗口应该产生2个版本
  console.log('测试3: 超过合并窗口 - 间隔6秒应该产生2个版本');
  try {
    const testRoom = `${TEST_ROOM_PREFIX}-nomerge`;
    await cleanup(testRoom);
    
    const ydoc = await persistence.getYDoc(testRoom);
    const text = ydoc.getText('content');
    
    // 第一次输入
    console.log('  第一次输入...');
    text.insert(0, 'First');
    await sleep(DEBOUNCE_DELAY + 500);
    
    const count1 = await getVersionCount(testRoom);
    console.log(`  第一次输入后版本数: ${count1}`);
    
    // 等待超过合并窗口
    console.log(`  等待 ${MERGE_WINDOW}ms 超过合并窗口...`);
    await sleep(MERGE_WINDOW);
    
    // 第二次输入
    console.log('  第二次输入...');
    text.insert(text.length, ' Second');
    await sleep(DEBOUNCE_DELAY + 500);
    
    const count2 = await getVersionCount(testRoom);
    console.log(`  第二次输入后版本数: ${count2}`);
    
    if (count2 === 2) {
      console.log('  ✓ 通过（产生2个版本）\n');
      passed++;
    } else {
      console.log(`  ✗ 失败: 期望2个版本，实际${count2}个\n`);
      failed++;
    }
    
    persistence.clearDocumentCache(testRoom);
    await cleanup(testRoom);
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
    console.error(e);
    failed++;
  }

  // 测试4: 模拟真实使用场景
  console.log('测试4: 综合测试 - 模拟真实使用场景');
  try {
    const testRoom = `${TEST_ROOM_PREFIX}-realworld`;
    await cleanup(testRoom);
    
    const ydoc = await persistence.getYDoc(testRoom);
    const text = ydoc.getText('content');
    
    // 场景1: 连续输入（应该合并为1个版本）
    console.log('  场景1: 连续输入5次...');
    for (let i = 0; i < 5; i++) {
      text.insert(text.length, `word${i} `);
      await sleep(200);
    }
    await sleep(DEBOUNCE_DELAY + 500);
    
    const count1 = await getVersionCount(testRoom);
    console.log(`  连续输入后版本数: ${count1}`);
    
    // 等待超过合并窗口
    console.log(`  等待 ${MERGE_WINDOW}ms...`);
    await sleep(MERGE_WINDOW);
    
    // 场景2: 再次输入（应该产生第2个版本）
    console.log('  场景2: 再次输入...');
    text.insert(text.length, 'more text here');
    await sleep(DEBOUNCE_DELAY + 500);
    
    const count2 = await getVersionCount(testRoom);
    console.log(`  再次输入后版本数: ${count2}`);
    
    if (count1 === 1 && count2 === 2) {
      console.log('  ✓ 通过\n');
      passed++;
    } else {
      console.log(`  ✗ 失败: 期望最终2个版本，实际${count2}个\n`);
      failed++;
    }
    
    persistence.clearDocumentCache(testRoom);
    await cleanup(testRoom);
  } catch (e) {
    console.log(`  ✗ 失败: ${e.message}\n`);
    console.error(e);
    failed++;
  }

  // 总结
  console.log('=== 测试结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n✓ 所有集成测试通过！');
    process.exit(0);
  } else {
    console.log('\n✗ 有测试失败');
    process.exit(1);
  }
}

// 主函数
async function main() {
  try {
    await runTests();
  } catch (e) {
    console.error('测试运行错误:', e);
    process.exit(1);
  }
}

main();
