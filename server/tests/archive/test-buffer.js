const Y = require('yjs');

// Test Buffer.from with Uint8Array
const arr = new Uint8Array([1, 2, 3, 4, 5]);
console.log('Original Uint8Array:', arr);
console.log('Buffer.from:', Buffer.from(arr));
console.log('Buffer.from equals:', Buffer.from(arr).equals(Buffer.from([1, 2, 3, 4, 5])));

// Test with actual Yjs update
const ydoc = new Y.Doc();
const text = ydoc.getText('test');
text.insert(0, 'Hello World');

const update = Y.encodeStateAsUpdate(ydoc);
console.log('\nYjs update:', update);
console.log('Update length:', update.length);
console.log('Buffer.from(update):', Buffer.from(update));
console.log('Buffer length:', Buffer.from(update).length);

// Convert back
const backToUint8 = new Uint8Array(Buffer.from(update));
console.log('Back to Uint8Array:', backToUint8);
console.log('Arrays equal:', JSON.stringify([...update]) === JSON.stringify([...backToUint8]));

// Test with larger data
const ydoc2 = new Y.Doc();
const xml = ydoc2.getXmlFragment('default');
const p = new Y.XmlElement('paragraph');
xml.push([p]);

const update2 = Y.encodeStateAsUpdate(ydoc2);
console.log('\n\nXmlFragment update length:', update2.length);
console.log('Buffer.from:', Buffer.from(update2).length);
