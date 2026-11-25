import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FileStorage, StoredFile } from '@cashpilot/application';
import type { RECEIPT_MIME_TYPES } from '@cashpilot/domain';

const extensions = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} satisfies Record<(typeof RECEIPT_MIME_TYPES)[number], string>;

const receiptTypes = Object.entries(extensions);
const receiptKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.([a-z]+)$/;

export class LocalFileStorage implements FileStorage {
  constructor(private readonly directory: string) {}

  async put(bytes: Uint8Array, mimeType: string): Promise<string> {
    const type = receiptTypes.find(([mime]) => mime === mimeType);
    if (!type) throw new Error('Unsupported receipt type');

    const key = `${randomUUID()}.${type[1]}`;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(path.join(this.directory, key), bytes, { flag: 'wx', mode: 0o600 });
    return key;
  }

  async get(key: string): Promise<StoredFile | null> {
    const extension = receiptKey.exec(key)?.[1];
    const type = receiptTypes.find(([, suffix]) => suffix === extension);
    if (!type) return null;

    try {
      const bytes = await readFile(path.join(this.directory, key));
      return { bytes: new Uint8Array(bytes), mimeType: type[0] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
}
