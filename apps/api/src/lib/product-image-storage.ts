import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from '../config/env.js';
import { AppError } from './errors.js';

export interface ImageStorage {
  save(buffer: Buffer, mime: string): Promise<string>;
  remove(key: string): Promise<void>;
  path(key: string): string;
}

export function createImageStorage(directory: 'products' | 'receipts'): ImageStorage {
  return {
    path(key) {
      if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(key)) throw AppError.notFound('Image not found');
      return path.resolve(env.UPLOAD_DIR, directory, key);
    },
    async save(buffer, mime) {
      const png =
        buffer.length >= 24 &&
        buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
        buffer.toString('ascii', 12, 16) === 'IHDR';
      const jpg =
        buffer.length >= 4 &&
        buffer[0] === 255 &&
        buffer[1] === 216 &&
        buffer[2] === 255 &&
        buffer[buffer.length - 2] === 255 &&
        buffer[buffer.length - 1] === 217;
      const webp =
        buffer.length >= 16 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP' &&
        ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16));
      const ext =
        mime === 'image/png' && png
          ? 'png'
          : mime === 'image/jpeg' && jpg
            ? 'jpg'
            : mime === 'image/webp' && webp
              ? 'webp'
              : null;
      if (!ext) throw AppError.badRequest('Invalid image content or type');
      if (!buffer.length || buffer.length > env.MAX_UPLOAD_SIZE_MB * 1024 * 1024)
        throw AppError.badRequest('Image size exceeds limit');
      const key = `${randomUUID()}.${ext}`;
      const destination = this.path(key);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, buffer, { flag: 'wx' });
      return key;
    },
    async remove(key) {
      await unlink(this.path(key)).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') throw err;
      });
    },
  };
}

export const productImageStorage = createImageStorage('products');
export const receiptStorage = createImageStorage('receipts');
