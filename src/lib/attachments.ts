import { uid } from './storage'

// Photo / signature attachments. Blobs are far too big for the synced
// localStorage state (a handful of phone photos would blow the ~5 MB
// quota and bloat every sync payload and audit-chain hash), so they
// live in IndexedDB on this device, keyed to the record they document:
// nameplate photos on units, invoice/docket photos on transactions,
// customer sign-off signatures on jobs.
//
// They are deliberately NOT part of the merge-synced AppState — other
// devices would see metadata for blobs they don't hold. They ARE part
// of the full JSON backup (exportAttachments / importAttachments embed
// them as data URLs) so "Export JSON" keeps meaning everything.

const DB_NAME = 'refrighandle-attachments'
const DB_VERSION = 1
const STORE = 'attachments'

export type AttachmentKind = 'photo' | 'signature'
export type AttachmentEntity =
  | 'unit'
  | 'transaction'
  | 'bottle'
  | 'site'
  | 'job'

export interface AttachmentMeta {
  id: string
  kind: AttachmentKind
  entityType: AttachmentEntity
  entityId: string
  mimeType: string
  byteSize: number
  createdAt: string
  caption?: string
  // Signatures: the printed name of who signed.
  signedBy?: string
}

export interface Attachment extends AttachmentMeta {
  blob: Blob
}

// Serialized form used inside the JSON backup file.
export interface ExportedAttachment extends AttachmentMeta {
  dataUrl: string
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('byEntity', ['entityType', 'entityId'])
      }
    }
    req.onsuccess = () => {
      const db = req.result
      // If another tab upgrades the schema, drop our handle so the next
      // call reopens cleanly.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('IndexedDB unavailable'))
    }
  })
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
  })
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

async function putAttachment(a: Attachment): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).put(a)
  await txDone(tx)
}

export async function listAttachments(
  entityType: AttachmentEntity,
  entityId: string,
  kind?: AttachmentKind,
): Promise<Attachment[]> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  const idx = tx.objectStore(STORE).index('byEntity')
  const all = await reqResult(
    idx.getAll(IDBKeyRange.only([entityType, entityId])) as IDBRequest<Attachment[]>,
  )
  return all
    .filter((a) => !kind || a.kind === kind)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function deleteAttachment(id: string): Promise<void> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(id)
  await txDone(tx)
}

export async function attachmentCount(): Promise<number> {
  const db = await openDb()
  const tx = db.transaction(STORE, 'readonly')
  return reqResult(tx.objectStore(STORE).count())
}

// Per-record attachment counts for one entity type, e.g. how many
// photos/signatures each transaction has, so list rows can show a
// badge. Walks the index with a KEY cursor — no blobs are read, so
// this stays cheap no matter how many megabytes of photos exist.
export function attachmentCounts(
  entityType: AttachmentEntity,
): Promise<Map<string, number>> {
  return openDb()
    .then((db) => {
      const tx = db.transaction(STORE, 'readonly')
      const idx = tx.objectStore(STORE).index('byEntity')
      const range = IDBKeyRange.bound([entityType, ''], [entityType, '￿'])
      const counts = new Map<string, number>()
      return new Promise<Map<string, number>>((resolve, reject) => {
        const cur = idx.openKeyCursor(range)
        cur.onsuccess = () => {
          const c = cur.result
          if (!c) {
            resolve(counts)
            return
          }
          const [, entityId] = c.key as [string, string]
          counts.set(entityId, (counts.get(entityId) ?? 0) + 1)
          c.continue()
        }
        cur.onerror = () => reject(cur.error ?? new Error('IndexedDB cursor failed'))
      })
    })
    .catch(() => new Map<string, number>())
}

// --- Image capture -----------------------------------------------------

// Downscale + re-encode a captured image so a 12 MP phone photo
// (~4 MB HEIC/JPEG) lands at a few hundred KB of JPEG. 1600 px on the
// long edge keeps nameplate text and docket numbers readable.
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.82

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file)
  } catch {
    // Some browsers can't createImageBitmap certain formats (e.g. HEIC
    // edge cases) but can still decode them through an <img>.
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        URL.revokeObjectURL(url)
        resolve(img)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Could not read that image'))
      }
      img.src = url
    })
  }
}

export async function compressImage(file: Blob): Promise<Blob> {
  const img = await decodeImage(file)
  const w = 'naturalWidth' in img ? img.naturalWidth : img.width
  const h = 'naturalHeight' in img ? img.naturalHeight : img.height
  if (!w || !h) throw new Error('Could not read that image')
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w * scale))
  canvas.height = Math.max(1, Math.round(h * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  if ('close' in img) img.close()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  )
  if (!blob) throw new Error('Could not encode the image')
  return blob
}

export async function addPhoto(
  entityType: AttachmentEntity,
  entityId: string,
  file: Blob,
  caption?: string,
): Promise<Attachment> {
  const blob = await compressImage(file)
  const a: Attachment = {
    id: uid(),
    kind: 'photo',
    entityType,
    entityId,
    mimeType: blob.type || 'image/jpeg',
    byteSize: blob.size,
    createdAt: new Date().toISOString(),
    caption: caption?.trim() || undefined,
    blob,
  }
  await putAttachment(a)
  return a
}

export async function addSignature(
  entityType: AttachmentEntity,
  entityId: string,
  blob: Blob,
  signedBy: string,
): Promise<Attachment> {
  const a: Attachment = {
    id: uid(),
    kind: 'signature',
    entityType,
    entityId,
    mimeType: blob.type || 'image/png',
    byteSize: blob.size,
    createdAt: new Date().toISOString(),
    signedBy: signedBy.trim() || undefined,
    blob,
  }
  await putAttachment(a)
  return a
}

// --- Backup round-trip ---------------------------------------------------

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error ?? new Error('Could not read attachment'))
    r.readAsDataURL(blob)
  })
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

export async function exportAttachments(): Promise<ExportedAttachment[]> {
  let all: Attachment[]
  try {
    const db = await openDb()
    const tx = db.transaction(STORE, 'readonly')
    all = await reqResult(tx.objectStore(STORE).getAll() as IDBRequest<Attachment[]>)
  } catch {
    // IndexedDB unavailable (private mode) — back up the state without
    // attachments rather than failing the whole export.
    return []
  }
  const out: ExportedAttachment[] = []
  for (const a of all) {
    const { blob, ...meta } = a
    out.push({ ...meta, dataUrl: await blobToDataUrl(blob) })
  }
  return out
}

// Restores attachments from a backup. Existing ids are overwritten —
// re-importing the same backup is idempotent. Returns how many were
// restored.
export async function importAttachments(
  items: readonly ExportedAttachment[],
): Promise<number> {
  let n = 0
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.dataUrl !== 'string') {
      continue
    }
    const { dataUrl, ...meta } = item
    try {
      const blob = await dataUrlToBlob(dataUrl)
      await putAttachment({ ...meta, blob })
      n++
    } catch {
      // Skip an unreadable entry rather than abort the whole restore.
    }
  }
  return n
}
