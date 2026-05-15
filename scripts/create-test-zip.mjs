import {crc32} from 'node:zlib';
import {writeFile} from 'node:fs/promises';

function uint16(value) {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value >>> 0, 0);
  return buf;
}

function uint32(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return buf;
}

// DOS date/time: 2025-04-01 10:30:00 (seconds / 2)
const dosTime = (10 << 11) | (30 << 5) | 0;
const dosDate = ((2025 - 1980) << 9) | (4 << 5) | 1;

const files = [
  {
    name: 'assets/精灵-战士.png',
    content: Buffer.from([0x89, 0x50, 0x4E, 0x47, ...Buffer.alloc(32, 0xFF)]),
  },
  {
    name: 'assets/中文文件-测试.txt',
    content: Buffer.from('这是一个中文文件名测试文件\n'),
  },
];

const nameBytes = files.map(f => Buffer.from(f.name, 'utf8'));
const fileCrcs = files.map(f => crc32(f.content));

const localHeaders = [];
const localOffsets = [];
let offset = 0;

for (let index = 0; index < files.length; index += 1) {
  localOffsets.push(offset);

  const localHeader = Buffer.concat([
    uint32(0x04034b50),
    uint16(20),
    uint16(0x0000),
    uint16(0),
    uint16(dosTime),
    uint16(dosDate),
    uint32(fileCrcs[index]),
    uint32(files[index].content.length),
    uint32(files[index].content.length),
    uint16(nameBytes[index].length),
    uint16(0),
    nameBytes[index],
  ]);

  localHeaders.push(localHeader);
  offset += localHeader.length + files[index].content.length;
}

const centralDirEntries = [];

for (let index = 0; index < files.length; index += 1) {
  const entry = Buffer.concat([
    uint32(0x02014b50),
    uint16(20),
    uint16(20),
    uint16(0x0000),
    uint16(0),
    uint16(dosTime),
    uint16(dosDate),
    uint32(fileCrcs[index]),
    uint32(files[index].content.length),
    uint32(files[index].content.length),
    uint16(nameBytes[index].length),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(localOffsets[index]),
    nameBytes[index],
  ]);

  centralDirEntries.push(entry);
}

const centralDir = Buffer.concat(centralDirEntries);
const centralDirOffset = offset;
const centralDirSize = centralDir.length;

const eocd = Buffer.concat([
  uint32(0x06054b50),
  uint16(0),
  uint16(0),
  uint16(files.length),
  uint16(files.length),
  uint32(centralDirSize),
  uint32(centralDirOffset),
  uint16(0),
]);

const zip = Buffer.concat([
  ...localHeaders.map((h, i) => Buffer.concat([h, files[i].content])),
  centralDir,
  eocd,
]);

await writeFile('test/test-fixture.zip', zip);

// Verify: read it back and check no UTF-8 flag
const {BlobReader, ZipReader} = await import('@zip.js/zip.js');
const reader = new ZipReader(new BlobReader(new Blob([zip])));
const entries = await reader.getEntries();
await reader.close();

console.log('Created test/test-fixture.zip');
console.log(`  entries: ${entries.length}`);
for (const entry of entries) {
  console.log(`  - "${entry.filename}"`);
  console.log(`    bitFlag: ${JSON.stringify(entry.bitFlag)}`);
  console.log(`    languageEncodingFlag: ${entry.bitFlag.languageEncodingFlag}`);
}
