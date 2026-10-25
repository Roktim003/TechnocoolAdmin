import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Env } from "@/shared/config/env";
import { listObjects, storageClient } from "@/shared/storage/storage";
import { backupTime, BACKUP_NAME } from "../domain/retention";

export interface BackupFile {
  name: string;
  at: Date;
  sizeBytes: number;
}

/** The backup folder on this server (BACKUP_DIR, the /backups volume in Docker). */
export class LocalBackups {
  constructor(readonly dir: string) {}

  async ensure(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  pathOf(name: string): string {
    if (!BACKUP_NAME.test(name)) throw new Error(`Not a backup file name: ${name}`);
    return path.join(this.dir, name);
  }

  /** A temporary file next to the final one; `commit` renames it into place atomically. */
  async writer(name: string) {
    await this.ensure();
    const final = this.pathOf(name);
    const tmp = `${final}.partial`;
    return {
      stream: createWriteStream(tmp, { mode: 0o600 }),
      commit: async () => {
        await rename(tmp, final);
        return (await stat(final)).size;
      },
      abort: () => rm(tmp, { force: true }),
    };
  }

  read(name: string): Readable {
    return createReadStream(this.pathOf(name));
  }

  async list(): Promise<BackupFile[]> {
    await this.ensure();
    const names = (await readdir(this.dir)).filter((n) => BACKUP_NAME.test(n));
    const files: BackupFile[] = [];
    for (const name of names) {
      const at = backupTime(name);
      if (at) files.push({ name, at, sizeBytes: (await stat(path.join(this.dir, name))).size });
    }
    return files.sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  async delete(names: string[]): Promise<void> {
    for (const n of names) await rm(this.pathOf(n), { force: true });
  }
}

/** The off-site bucket (BACKUP_S3_*): database dumps under <prefix>/db/, attachments under <prefix>/attachments/. */
export class OffsiteBackups {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly prefix: string,
  ) {}

  static fromEnv(e: Env): OffsiteBackups | null {
    if (!(e.BACKUP_S3_ENDPOINT && e.BACKUP_S3_BUCKET && e.BACKUP_S3_KEY && e.BACKUP_S3_SECRET)) return null;
    const client = new S3Client({
      endpoint: e.BACKUP_S3_ENDPOINT,
      region: e.BACKUP_S3_REGION,
      forcePathStyle: e.BACKUP_S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.BACKUP_S3_KEY, secretAccessKey: e.BACKUP_S3_SECRET },
    });
    return new OffsiteBackups(client, e.BACKUP_S3_BUCKET, e.BACKUP_S3_PREFIX.replace(/^\/+|\/+$/g, ""));
  }

  get location(): string {
    return `s3://${this.bucket}/${this.prefix}`;
  }

  private dbKey(name: string) {
    return `${this.prefix}/db/${name}`;
  }

  async upload(name: string, file: string, sizeBytes: number): Promise<void> {
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: this.dbKey(name), Body: createReadStream(file), ContentLength: sizeBytes, ContentType: "application/octet-stream" }));
  }

  async download(name: string): Promise<Readable> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: this.dbKey(name) }));
    return res.Body as Readable;
  }

  async list(): Promise<BackupFile[]> {
    const objects = await listObjects(this.client, this.bucket, `${this.prefix}/db/`);
    return objects
      .map((o) => ({ name: o.key.slice(`${this.prefix}/db/`.length), sizeBytes: o.size }))
      .flatMap((o) => {
        const at = backupTime(o.name);
        return at ? [{ ...o, at }] : [];
      })
      .sort((a, b) => b.at.getTime() - a.at.getTime());
  }

  async delete(names: string[]): Promise<void> {
    for (let i = 0; i < names.length; i += 1000) {
      const batch = names.slice(i, i + 1000);
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: batch.map((n) => ({ Key: this.dbKey(n) })), Quiet: true } }));
    }
  }

  /**
   * Copies attachments (photos, invoices, challans, exports) that are missing off-site or
   * changed. Objects are only added or replaced, never deleted off-site, so a file deleted by
   * mistake in the app can still be recovered.
   */
  async syncAttachments(sourceBucket: string): Promise<{ copied: number; skipped: number; bytes: number }> {
    const source = storageClient();
    const [have, want] = await Promise.all([listObjects(this.client, this.bucket, `${this.prefix}/attachments/`), listObjects(source, sourceBucket)]);
    const existing = new Map(have.map((o) => [o.key.slice(`${this.prefix}/attachments/`.length), o]));
    let copied = 0;
    let bytes = 0;
    for (const o of want) {
      const there = existing.get(o.key);
      if (there && there.size === o.size && (!o.etag || !there.etag || there.etag === o.etag)) continue;
      const obj = await source.send(new GetObjectCommand({ Bucket: sourceBucket, Key: o.key }));
      await this.client.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: `${this.prefix}/attachments/${o.key}`, Body: obj.Body as Readable, ContentLength: o.size, ContentType: obj.ContentType }),
      );
      copied++;
      bytes += o.size;
    }
    return { copied, skipped: want.length - copied, bytes };
  }
}
