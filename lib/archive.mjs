// Small, dependency-free ZIP writer for the bundled companion's known files.
// Stored entries keep packaging available on every DSH host without a system zip tool.
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0})
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=table[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
export function zipFiles(files){
  const local=[],central=[];let offset=0
  for(const [name,value] of Object.entries(files)){
    if(!/^[A-Za-z0-9_.-]+$/.test(name)||name==='.'||name==='..')throw new Error('Invalid archive filename')
    const bytes=Buffer.from(value),filename=Buffer.from(name),crc=crc32(bytes)
    const head=Buffer.alloc(30);head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt16LE(33,12);head.writeUInt32LE(crc,14);head.writeUInt32LE(bytes.length,18);head.writeUInt32LE(bytes.length,22);head.writeUInt16LE(filename.length,26)
    const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(33,14);entry.writeUInt32LE(crc,16);entry.writeUInt32LE(bytes.length,20);entry.writeUInt32LE(bytes.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42)
    local.push(head,filename,bytes);central.push(entry,filename);offset+=head.length+filename.length+bytes.length
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22),count=Object.keys(files).length
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(count,8);end.writeUInt16LE(count,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16)
  return Buffer.concat([...local,directory,end])
}
