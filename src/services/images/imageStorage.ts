/**
 * Image storage abstraction.
 *
 * Phase 1: images picked from the device are compressed in the browser and
 * stored as individual LocalStorage entries. Records only keep a short
 * reference (`local-img:<id>`), so the main database stays small and fast.
 *
 * Phase 2: replace `saveImage`, `resolveImage` and `deleteImage` with
 * Firebase Storage calls — records already store an opaque reference.
 */
import type { Database } from '@/src/types/domain';
import { createId } from '@/src/utils/crypto';
import { AppError, isQuotaError } from '@/src/services/storage/errors';

const PREFIX = 'local-img:';
const KEY_PREFIX = 'tablecraft:img:';
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const TARGET_MAX_CHARS = 420_000; // ≈ 310 KB binary per image

const memo = new Map<string, string>();

export function isLocalImage(ref: string | undefined): boolean {
  return Boolean(ref && ref.startsWith(PREFIX));
}

export function resolveImage(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  if (!isLocalImage(ref)) return ref; // bundled asset or remote URL
  const cached = memo.get(ref);
  if (cached) return cached;
  try {
    const data = window.localStorage.getItem(KEY_PREFIX + ref.slice(PREFIX.length)) ?? undefined;
    if (data) memo.set(ref, data);
    return data;
  } catch {
    return undefined;
  }
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new AppError('validation', 'The selected file could not be read.'));
    reader.readAsDataURL(file);
  });
}

function decode(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new AppError('validation', 'That file is not a supported image.'));
    img.src = src;
  });
}

function render(img: HTMLImageElement, maxEdge: number, quality: number): string {
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('storage', 'Image processing is not available in this browser.');
  ctx.drawImage(img, 0, 0, w, h);
  const webp = canvas.toDataURL('image/webp', quality);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
}

/** Compress progressively until the image fits the per-image budget. */
export async function compressImage(file: File, maxEdge = 1100): Promise<string> {
  if (!file.type.startsWith('image/')) throw new AppError('validation', 'Choose a JPG, PNG or WebP image.');
  if (file.size > MAX_SOURCE_BYTES) throw new AppError('validation', 'That image is larger than 15 MB. Choose a smaller photo.');
  const img = await decode(await readFile(file));
  const attempts: Array<[number, number]> = [
    [maxEdge, 0.82],
    [maxEdge, 0.7],
    [900, 0.68],
    [720, 0.62],
    [560, 0.58],
  ];
  let out = '';
  for (const [edge, q] of attempts) {
    out = render(img, edge, q);
    if (out.length <= TARGET_MAX_CHARS) return out;
  }
  return out;
}

/** Compress and persist an image. Throws a clear error when storage is full. */
export async function saveImage(file: File, options: { maxEdge?: number } = {}): Promise<string> {
  const dataUrl = await compressImage(file, options.maxEdge);
  const id = createId('img');
  try {
    window.localStorage.setItem(KEY_PREFIX + id, dataUrl);
  } catch (err) {
    if (isQuotaError(err)) {
      throw new AppError(
        'storage_quota',
        'Browser storage is full, so this image was not saved. Delete unused images or reset demo data, then try again.'
      );
    }
    throw new AppError('storage', 'This image could not be saved to browser storage.');
  }
  const ref = PREFIX + id;
  memo.set(ref, dataUrl);
  return ref;
}

export function deleteImage(ref: string | undefined): void {
  if (!isLocalImage(ref)) return;
  memo.delete(ref!);
  try {
    window.localStorage.removeItem(KEY_PREFIX + ref!.slice(PREFIX.length));
  } catch {
    /* ignore */
  }
}

/** Remove stored images that no record references any more. */
export function collectOrphanImages(db: Database): number {
  const used = new Set<string>();
  db.products.forEach((p) => used.add(p.image));
  db.categories.forEach((c) => used.add(c.image));
  db.restaurants.forEach((r) => {
    used.add(r.logoImage);
    used.add(r.coverImage);
  });
  let removed = 0;
  try {
    const store = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(KEY_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => {
      const ref = PREFIX + k.slice(KEY_PREFIX.length);
      if (!used.has(ref)) {
        store.removeItem(k);
        memo.delete(ref);
        removed++;
      }
    });
  } catch {
    /* ignore */
  }
  return removed;
}

export function imageStorageUsage(): { count: number; bytes: number } {
  let count = 0;
  let bytes = 0;
  try {
    const store = window.localStorage;
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(KEY_PREFIX)) {
        count++;
        bytes += (store.getItem(k)?.length ?? 0) * 2;
      }
    }
  } catch {
    /* ignore */
  }
  return { count, bytes };
}
