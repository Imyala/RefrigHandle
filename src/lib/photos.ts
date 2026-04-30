import { createStore, set, get, del, keys } from 'idb-keyval'
import { uid } from './storage'

// Photos are kept out of the main JSON state — they live in IndexedDB
// keyed by id. Transactions/bottles store only the id reference.
const photoStore = createStore('refrighandle-photos', 'photos')

export interface StoredPhoto {
  id: string
  blob: Blob
  createdAt: string
}

const MAX_DIM = 1280
const QUALITY = 0.8

export async function compressImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()

  return await new Promise<Blob>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b ?? file),
      'image/jpeg',
      QUALITY,
    )
  })
}

export async function savePhoto(file: Blob): Promise<string> {
  const compressed = await compressImage(file)
  const id = uid()
  const record: StoredPhoto = {
    id,
    blob: compressed,
    createdAt: new Date().toISOString(),
  }
  await set(id, record, photoStore)
  return id
}

export async function loadPhoto(id: string): Promise<string | null> {
  const record = (await get(id, photoStore)) as StoredPhoto | undefined
  if (!record) return null
  return URL.createObjectURL(record.blob)
}

export async function deletePhoto(id: string): Promise<void> {
  await del(id, photoStore)
}

export async function deletePhotos(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => del(id, photoStore)))
}

export async function listPhotoIds(): Promise<string[]> {
  return (await keys(photoStore)) as string[]
}
