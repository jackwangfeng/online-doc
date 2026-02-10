const persistence = require('./yjs-persistence');
const Y = require('yjs');

async function test() {
  const roomId = '76548a16-d703-4dba-b688-502358f56384';
  
  console.log('Testing server document loading...\n');
  
  // Get document from persistence
  const ydoc = await persistence.getYDoc(roomId);
  
  console.log('Document loaded from persistence:');
  console.log('- Shared types:', Array.from(ydoc.share.keys()));
  
  // Check each shared type
  ydoc.share.forEach((value, key) => {
    console.log(`\nShared type "${key}": ${value.constructor.name}`);
    
    if (value instanceof Y.XmlFragment) {
      console.log('  XmlFragment content:', value.toString().slice(0, 200));
    } else if (value instanceof Y.XmlElement) {
      console.log('  XmlElement content:', value.toString().slice(0, 200));
    } else if (value instanceof Y.Text) {
      console.log('  Text content:', value.toString().slice(0, 200));
    } else if (value instanceof Y.Array) {
      console.log('  Array length:', value.length);
      console.log('  Array content:', value.toArray().slice(0, 5));
    } else if (value instanceof Y.Map) {
      console.log('  Map keys:', Array.from(value.keys()));
    } else {
      console.log('  Value:', value.toString ? value.toString().slice(0, 200) : 'N/A');
    }
  });
  
  // Get state as update
  const state = Y.encodeStateAsUpdate(ydoc);
  console.log('\nEncoded state size:', state.length, 'bytes');
  
  // Create a new doc and apply the state
  const newYdoc = new Y.Doc();
  Y.applyUpdate(newYdoc, state);
  
  console.log('\nNew document after applying state:');
  console.log('- Shared types:', Array.from(newYdoc.share.keys()));
  
  newYdoc.share.forEach((value, key) => {
    console.log(`\nShared type "${key}": ${value.constructor.name}`);
    if (value.toString) {
      console.log('  Content:', value.toString().slice(0, 200));
    }
  });
}

test().catch(console.error).finally(() => process.exit(0));
