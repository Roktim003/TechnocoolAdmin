import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/shared/config/env";
import { logger } from "@/shared/logger/logger";

/**
 * Private object storage. Objects are never public: the app reads them and serves them
 * through authenticated routes. Reused by later modules for invoices, challans, attachments.
 */
export interface StorageAdapter {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** Returns null when the object does not exist. */
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(keys: string[]): Promise<void>;
}

class S3Storage implements StorageAdapter {
  private ready: Promise<void> | undefined;

  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly autoCreate: boolean,
  ) {}

  /** Creates the bucket on first use when S3_AUTO_CREATE_BUCKET=true (dev / tests). */
  private ensureBucket(): Promise<void> {
    if (!this.autoCreate) return Promise.resolve();
    this.ready ??= (async () => {
      try {
        await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      } catch {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket })).catch((err: { name?: string }) => {
          if (err.name !== "BucketAlreadyOwnedByYou" && err.name !== "BucketAlreadyExists") throw err;
        });
        logger.info({ bucket: this.bucket }, "storage bucket created");
      }
    })().catch((err) => {
      this.ready = undefined;
      throw err;
    });
    return this.ready;
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    await this.ensureBucket();
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  async get(key: string) {
    await this.ensureBucket();
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const body = await res.Body!.transformToByteArray();
      return { body, contentType: res.ContentType ?? "application/octet-stream" };
    } catch (err) {
      if (err instanceof NoSuchKey || (err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }

  async delete(keys: string[]) {
    if (keys.length === 0) return;
    await this.ensureBucket();
    await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
  }
}

const globalForStorage = globalThis as unknown as { storage?: StorageAdapter; s3?: S3Client };

/** The S3 client of the attachments bucket (S3_*). */
export function storageClient(): S3Client {
  if (!globalForStorage.s3) {
    const e = env();
    globalForStorage.s3 = new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
  }
  return globalForStorage.s3;
}

export function storage(): StorageAdapter {
  if (!globalForStorage.storage) {
    const e = env();
    globalForStorage.storage = new S3Storage(storageClient(), e.S3_BUCKET, e.S3_AUTO_CREATE_BUCKET);
  }
  return globalForStorage.storage;
}

/** Readiness: the attachments bucket answers. */
export async function probeStorage(): Promise<void> {
  await storageClient().send(new HeadBucketCommand({ Bucket: env().S3_BUCKET }));
}

export interface StoredObject {
  key: string;
  size: number;
  etag?: string;
}

/** Every object in a bucket (paged), optionally under a prefix. */
export async function listObjects(client: S3Client, bucket: string, prefix?: string): Promise<StoredObject[]> {
  const out: StoredObject[] = [];
  let token: string | undefined;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
    for (const o of page.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: Number(o.Size ?? 0), etag: o.ETag });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Objects and bytes in the attachments bucket (System health). */
export async function storageUsage(): Promise<{ objects: number; bytes: number }> {
  const all = await listObjects(storageClient(), env().S3_BUCKET);
  return { objects: all.length, bytes: all.reduce((n, o) => n + o.size, 0) };
}
