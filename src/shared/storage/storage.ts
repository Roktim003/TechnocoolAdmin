import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
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

const globalForStorage = globalThis as unknown as { storage?: StorageAdapter };

export function storage(): StorageAdapter {
  if (!globalForStorage.storage) {
    const e = env();
    const client = new S3Client({
      endpoint: e.S3_ENDPOINT,
      region: e.S3_REGION,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY },
    });
    globalForStorage.storage = new S3Storage(client, e.S3_BUCKET, e.S3_AUTO_CREATE_BUCKET);
  }
  return globalForStorage.storage;
}
