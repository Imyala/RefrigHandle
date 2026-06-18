// Minimal, dependency-free ZIP writer (STORE method — no compression).
// Enough to bundle a couple of text files (a JSON backup + a CSV log) into
// one archive in the browser. Avoids pulling in a zip library for the sake
// of the account-closure export.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

export interface ZipEntry {
  name: string
  data: string | Uint8Array
}

export function createZip(files: ZipEntry[]): Blob {
  const enc = new TextEncoder()
  const now = new Date()
  // DOS time/date packing for the (cosmetic) modified timestamp.
  const dosTime =
    ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) &
    0xffff
  const dosDate =
    (((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate()) &
    0xffff

  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const f of files) {
    const nameBytes = enc.encode(f.name)
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    const crc = crc32(data)
    const size = data.length

    const local = new Uint8Array(30 + nameBytes.length)
    const dv = new DataView(local.buffer)
    dv.setUint32(0, 0x04034b50, true) // local file header signature
    dv.setUint16(4, 20, true) // version needed
    dv.setUint16(6, 0x0800, true) // flags: UTF-8 filename
    dv.setUint16(8, 0, true) // method: store
    dv.setUint16(10, dosTime, true)
    dv.setUint16(12, dosDate, true)
    dv.setUint32(14, crc, true)
    dv.setUint32(18, size, true) // compressed size
    dv.setUint32(22, size, true) // uncompressed size
    dv.setUint16(26, nameBytes.length, true)
    dv.setUint16(28, 0, true) // extra length
    local.set(nameBytes, 30)
    parts.push(local, data)

    const cd = new Uint8Array(46 + nameBytes.length)
    const cdv = new DataView(cd.buffer)
    cdv.setUint32(0, 0x02014b50, true) // central directory signature
    cdv.setUint16(4, 20, true) // version made by
    cdv.setUint16(6, 20, true) // version needed
    cdv.setUint16(8, 0x0800, true) // flags: UTF-8
    cdv.setUint16(10, 0, true) // method
    cdv.setUint16(12, dosTime, true)
    cdv.setUint16(14, dosDate, true)
    cdv.setUint32(16, crc, true)
    cdv.setUint32(20, size, true)
    cdv.setUint32(24, size, true)
    cdv.setUint16(28, nameBytes.length, true)
    cdv.setUint16(30, 0, true) // extra length
    cdv.setUint16(32, 0, true) // comment length
    cdv.setUint16(34, 0, true) // disk number start
    cdv.setUint16(36, 0, true) // internal attrs
    cdv.setUint32(38, 0, true) // external attrs
    cdv.setUint32(42, offset, true) // local header offset
    cd.set(nameBytes, 46)
    central.push(cd)

    offset += local.length + data.length
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0)
  const end = new Uint8Array(22)
  const edv = new DataView(end.buffer)
  edv.setUint32(0, 0x06054b50, true) // end of central directory signature
  edv.setUint16(8, files.length, true) // entries on this disk
  edv.setUint16(10, files.length, true) // total entries
  edv.setUint32(12, centralSize, true)
  edv.setUint32(16, offset, true) // central directory offset
  edv.setUint16(20, 0, true) // comment length

  // Cast: Uint8Array is a valid BlobPart at runtime; the lib's generic
  // ArrayBuffer/SharedArrayBuffer split makes TS reject it otherwise.
  return new Blob([...parts, ...central, end] as BlobPart[], {
    type: 'application/zip',
  })
}
