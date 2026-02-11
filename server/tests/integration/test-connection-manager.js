/**
 * 连接管理器集成测试
 * 测试文档连接管理、归档和内存释放功能
 * 
 * 注意：这个测试通过 HTTP API 和 WebSocket 与服务器交互，
 * 验证连接管理器的功能是否正常工作
 */

const WebSocket = require('ws');
const Y = require('yjs');
const persistence = require('../../yjs-persistence');

// 测试配置
const TEST_ROOM = `test-connection-${Date.now()}`;
const SERVER_URL = 'ws://localhost:3000';
const HTTP_URL = 'http://localhost:3000';
const ARCHIVE_DELAY = 6000; // 比管理器的 5000ms 稍长

// 延迟函数
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 创建 WebSocket 连接
function createConnection(roomName) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${SERVER_URL}/${roomName}`);
    
    ws.on('open', () => {
      console.log(`  Connected to ${roomName}`);
      resolve(ws);
    });
    
    ws.on('error', (err) => {
      console.error(`  Connection error for ${roomName}:`, err.message);
      reject(err);
    });
  });
}

// 关闭 WebSocket 连接
function closeConnection(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.on('close', () => resolve());
    ws.close();
  });
}

// 获取服务器状态
async function getServerStatus() {
  try {
    const response = await fetch(`${HTTP_URL}/status`);
    return await response.json();
  } catch (err) {
    console.error('Failed to get server status:', err.message);
    return null;
  }
}

// 获取文档版本历史
async function getVersionHistory(roomName) {
  try {
    const response = await fetch(`${HTTP_URL}/versions/${roomName}/history`);
    const data = await response.json();
    return data.versions || [];
  } catch (err) {
    console.error('Failed to get version history:', err.message);
    return [];
  }
}

// 测试 1: 连接计数（通过服务器状态API）
async function testConnectionCount() {
  console.log('\n测试 1: 连接计数');
  
  const roomName = `${TEST_ROOM}-count`;
  const connections = [];
  
  try {
    // 创建 3 个连接
    for (let i = 0; i < 3; i++) {
      const ws = await createConnection(roomName);
      connections.push(ws);
      await sleep(200); // 等待连接注册
    }
    
    // 通过服务器状态API检查连接数
    await sleep(500);
    const status = await getServerStatus();
    const docInfo = status?.documents?.find(d => d.name === roomName);
    const connectionCount = docInfo?.connections || 0;
    
    console.log(`  创建 3 个连接，服务器记录: ${connectionCount}`);
    
    if (connectionCount === 3) {
      console.log('  ✓ 通过');
    } else {
      console.log('  ✗ 失败');
      return false;
    }
    
    // 关闭所有连接
    for (const ws of connections) {
      await closeConnection(ws);
    }
    await sleep(200);
    
    // 再次检查
    const statusAfter = await getServerStatus();
    const docInfoAfter = statusAfter?.documents?.find(d => d.name === roomName);
    const connectionCountAfter = docInfoAfter?.connections || 0;
    
    console.log(`  关闭所有连接后，服务器记录: ${connectionCountAfter}`);
    
    if (connectionCountAfter === 0) {
      console.log('  ✓ 通过');
      return true;
    } else {
      console.log('  ✗ 失败');
      return false;
    }
  } finally {
    // 清理
    for (const ws of connections) {
      if (ws.readyState !== WebSocket.CLOSED) {
        ws.close();
      }
    }
  }
}

// 测试 2: 文档归档（有变化）
async function testArchiveWithChanges() {
  console.log('\n测试 2: 文档归档（有变化）');
  
  const roomName = `${TEST_ROOM}-archive-changes`;
  let ws;
  
  try {
    // 先获取初始版本数
    const versionsBefore = await getVersionHistory(roomName);
    const initialCount = versionsBefore.length;
    console.log(`  初始版本数: ${initialCount}`);
    
    // 创建连接
    ws = await createConnection(roomName);
    await sleep(500);
    
    // 通过 persistence API 直接保存更新（模拟编辑）
    // 注意：直接通过 WebSocket 发送 Yjs 更新需要使用 y-protocols 同步协议
    // 这里我们直接调用 persistence API 来模拟文档变化
    const ydoc = new Y.Doc();
    const text = ydoc.getText('content');
    text.insert(0, 'Hello, this is a test document with changes!');
    
    const update = Y.encodeStateAsUpdate(ydoc);
    await persistence.storeUpdate(roomName, Buffer.from(update));
    console.log(`  保存更新到数据库 (${update.length} bytes)`);
    
    await sleep(500);
    
    // 关闭连接
    await closeConnection(ws);
    console.log(`  关闭连接，等待 ${ARCHIVE_DELAY}ms 归档...`);
    
    // 等待归档
    await sleep(ARCHIVE_DELAY);
    
    // 检查版本数
    const versionsAfter = await getVersionHistory(roomName);
    const finalCount = versionsAfter.length;
    console.log(`  归档后版本数: ${finalCount}`);
    
    if (finalCount > initialCount) {
      console.log('  ✓ 通过（检测到新版本）');
      return true;
    } else {
      console.log('  ✗ 失败（没有新版本）');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  } finally {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  }
}

// 测试 3: 文档归档（无变化）
async function testArchiveWithoutChanges() {
  console.log('\n测试 3: 文档归档（无变化）');
  
  const roomName = `${TEST_ROOM}-archive-nochanges`;
  let ws;
  
  try {
    // 先创建连接并保存一些内容
    ws = await createConnection(roomName);
    await sleep(500);
    
    const ydoc = new Y.Doc();
    const text = ydoc.getText('content');
    text.insert(0, 'Initial content');
    
    const update = Y.encodeStateAsUpdate(ydoc);
    ws.send(Buffer.from(update));
    console.log(`  创建初始文档 (${update.length} bytes)`);
    
    await sleep(1000);
    
    // 获取初始版本数
    const versionsBefore = await getVersionHistory(roomName);
    const initialCount = versionsBefore.length;
    console.log(`  初始版本数: ${initialCount}`);
    
    // 关闭连接
    await closeConnection(ws);
    console.log(`  关闭连接，等待 ${ARCHIVE_DELAY}ms 归档...`);
    
    // 等待归档
    await sleep(ARCHIVE_DELAY);
    
    // 重新连接但不修改
    ws = await createConnection(roomName);
    await sleep(500);
    
    // 直接关闭，不发送更新
    await closeConnection(ws);
    console.log(`  再次关闭（无修改），等待 ${ARCHIVE_DELAY}ms 归档...`);
    
    // 等待归档
    await sleep(ARCHIVE_DELAY);
    
    // 检查版本数
    const versionsAfter = await getVersionHistory(roomName);
    const finalCount = versionsAfter.length;
    console.log(`  第二次归档后版本数: ${finalCount}`);
    
    if (finalCount === initialCount) {
      console.log('  ✓ 通过（无变化，未创建新版本）');
      return true;
    } else {
      console.log('  ✗ 失败（创建了不必要的版本）');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  } finally {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  }
}

// 测试 4: 内存释放
async function testMemoryRelease() {
  console.log('\n测试 4: 内存释放');
  
  const roomName = `${TEST_ROOM}-memory`;
  let ws;
  
  try {
    // 创建连接
    ws = await createConnection(roomName);
    await sleep(500);
    
    // 检查文档是否在内存中（通过服务器状态）
    const statusBefore = await getServerStatus();
    const docInMemoryBefore = statusBefore?.documents?.some(d => d.name === roomName);
    console.log(`  连接时文档在内存中: ${docInMemoryBefore}`);
    
    // 关闭连接
    await closeConnection(ws);
    console.log(`  关闭连接，等待 ${ARCHIVE_DELAY}ms 归档...`);
    
    // 等待归档
    await sleep(ARCHIVE_DELAY);
    
    // 检查文档是否从内存中释放
    const statusAfter = await getServerStatus();
    const docInMemoryAfter = statusAfter?.documents?.some(d => d.name === roomName);
    console.log(`  归档后文档在内存中: ${docInMemoryAfter}`);
    
    if (docInMemoryBefore && !docInMemoryAfter) {
      console.log('  ✓ 通过（文档已从内存释放）');
      return true;
    } else {
      console.log('  ✗ 失败');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  } finally {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  }
}

// 测试 5: 重新连接加载
async function testReconnectLoad() {
  console.log('\n测试 5: 重新连接加载');
  
  const roomName = `${TEST_ROOM}-reconnect`;
  let ws1, ws2;
  
  try {
    // 第一次连接并编辑
    ws1 = await createConnection(roomName);
    await sleep(500);
    
    const ydoc1 = new Y.Doc();
    const text1 = ydoc1.getText('content');
    text1.insert(0, 'Content before disconnect');
    
    const update1 = Y.encodeStateAsUpdate(ydoc1);
    ws1.send(Buffer.from(update1));
    console.log(`  第一次连接，发送更新: "${text1.toString()}"`);
    
    await sleep(1000);
    
    // 关闭连接
    await closeConnection(ws1);
    console.log(`  关闭连接，等待 ${ARCHIVE_DELAY}ms 归档...`);
    await sleep(ARCHIVE_DELAY);
    
    // 验证文档已从内存释放
    const statusBefore = await getServerStatus();
    const wasReleased = !statusBefore?.documents?.some(d => d.name === roomName);
    console.log(`  文档已从内存释放: ${wasReleased}`);
    
    // 重新连接
    console.log('  重新连接...');
    ws2 = await createConnection(roomName);
    await sleep(500);
    
    // 检查文档是否正确加载
    const statusAfter = await getServerStatus();
    const docInMemory = statusAfter?.documents?.some(d => d.name === roomName);
    console.log(`  重新连接后文档在内存中: ${docInMemory}`);
    
    if (docInMemory) {
      console.log('  ✓ 通过（文档正确加载）');
      return true;
    } else {
      console.log('  ✗ 失败（文档未加载）');
      return false;
    }
  } catch (err) {
    console.error('  测试错误:', err.message);
    return false;
  } finally {
    if (ws1 && ws1.readyState !== WebSocket.CLOSED) ws1.close();
    if (ws2 && ws2.readyState !== WebSocket.CLOSED) ws2.close();
  }
}

// 运行所有测试
async function runTests() {
  console.log('=== 连接管理器集成测试 ===');
  console.log(`测试文档前缀: ${TEST_ROOM}`);
  console.log(`服务器: ${SERVER_URL}`);
  
  const results = [];
  
  results.push({ name: '连接计数', passed: await testConnectionCount() });
  results.push({ name: '文档归档（有变化）', passed: await testArchiveWithChanges() });
  results.push({ name: '文档归档（无变化）', passed: await testArchiveWithoutChanges() });
  results.push({ name: '内存释放', passed: await testMemoryRelease() });
  results.push({ name: '重新连接加载', passed: await testReconnectLoad() });
  
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
