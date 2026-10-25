import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";

/**
 * Backup encryption in the OpenSSL `enc` format, so a backup made by the app can be decrypted
 * on any machine with the openssl command (scripts/restore.sh does exactly this):
 *
 *   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256 -pass env:BACKUP_ENCRYPTION_KEY
 *
 * File layout: "Salted__" + 8-byte salt + AES-256-CBC ciphertext; key and IV come from
 * PBKDF2-HMAC-SHA256(passphrase, salt, 200000 iterations).
 */
export const PBKDF2_ITERATIONS = 200_000;
const MAGIC = Buffer.from("Salted__", "latin1");

function derive(passphrase: string, salt: Buffer): { key: Buffer; iv: Buffer } {
  const km = pbkdf2Sync(Buffer.from(passphrase, "utf8"), salt, PBKDF2_ITERATIONS, 48, "sha256");
  return { key: km.subarray(0, 32), iv: km.subarray(32, 48) };
}

export function encryptStream(passphrase: string): Transform {
  const salt = randomBytes(8);
  const { key, iv } = derive(passphrase, salt);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  let headerSent = false;
  return new Transform({
    transform(chunk: Buffer, _enc, cb: TransformCallback) {
      if (!headerSent) {
        this.push(Buffer.concat([MAGIC, salt]));
        headerSent = true;
      }
      cb(null, cipher.update(chunk));
    },
    flush(cb) {
      if (!headerSent) this.push(Buffer.concat([MAGIC, salt]));
      cb(null, cipher.final());
    },
  });
}

export function decryptStream(passphrase: string): Transform {
  let header = Buffer.alloc(0);
  let decipher: ReturnType<typeof createDecipheriv> | null = null;
  return new Transform({
    transform(chunk: Buffer, _enc, cb: TransformCallback) {
      try {
        if (!decipher) {
          header = Buffer.concat([header, chunk]);
          if (header.length < 16) return cb();
          if (!header.subarray(0, 8).equals(MAGIC)) return cb(new Error("Not an encrypted StockBook backup (missing OpenSSL header)."));
          const { key, iv } = derive(passphrase, header.subarray(8, 16));
          decipher = createDecipheriv("aes-256-cbc", key, iv);
          const rest = header.subarray(16);
          header = Buffer.alloc(0);
          return cb(null, rest.length ? decipher.update(rest) : undefined);
        }
        cb(null, decipher.update(chunk));
      } catch (err) {
        cb(err as Error);
      }
    },
    flush(cb) {
      try {
        if (!decipher) return cb(new Error("Encrypted backup is empty or truncated."));
        cb(null, decipher.final());
      } catch {
        cb(new Error("Could not decrypt the backup: wrong BACKUP_ENCRYPTION_KEY or a damaged file."));
      }
    },
  });
}
