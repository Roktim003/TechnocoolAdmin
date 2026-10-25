import sharp, { type Metadata } from "sharp";
import { ValidationError } from "@/shared/errors/app-error";

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const THUMBNAIL_SIZE = 400;

const ALLOWED: Record<string, { contentType: string; ext: string }> = {
  jpeg: { contentType: "image/jpeg", ext: "jpg" },
  png: { contentType: "image/png", ext: "png" },
  webp: { contentType: "image/webp", ext: "webp" },
};

export interface ProcessedImage {
  original: Uint8Array;
  contentType: string;
  ext: string;
  width: number;
  height: number;
  thumbnail: Uint8Array;
}

/**
 * Validates an uploaded image by its content (not its name or declared type) and builds a
 * 400px WebP thumbnail. Accepts JPEG, PNG and WebP up to 5 MB.
 */
export async function processImage(bytes: Uint8Array, label = "file"): Promise<ProcessedImage> {
  if (bytes.byteLength === 0) throw new ValidationError(`${label} is empty.`, [{ path: "file", message: "File is empty.", code: "EMPTY_FILE" }]);
  if (bytes.byteLength > IMAGE_MAX_BYTES) {
    throw new ValidationError(`${label} is larger than 5 MB.`, [{ path: "file", message: "Each photo must be 5 MB or smaller.", code: "FILE_TOO_LARGE" }]);
  }

  let meta: Metadata;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    meta = {} as Metadata;
  }
  const kind = meta.format ? ALLOWED[meta.format] : undefined;
  if (!kind || !meta.width || !meta.height) {
    throw new ValidationError(`${label} is not a JPG, PNG or WebP image.`, [{ path: "file", message: "Only JPG, PNG and WebP images are allowed.", code: "INVALID_FILE_TYPE" }]);
  }

  // Re-orient by EXIF so phone photos aren't sideways in the thumbnail.
  const thumbnail = await sharp(bytes).rotate().resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  return { original: bytes, contentType: kind.contentType, ext: kind.ext, width: meta.width, height: meta.height, thumbnail: new Uint8Array(thumbnail) };
}
