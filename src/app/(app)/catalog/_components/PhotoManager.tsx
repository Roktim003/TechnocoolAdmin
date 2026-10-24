"use client";

/* eslint-disable @next/next/no-img-element -- photos come from the authenticated API proxy or local blob: previews */
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Tag } from "@/components/ui/Tag";
import { api, errorMessage, upload } from "@/lib/api-client";
import type { PhotoDto } from "./types";
import styles from "./catalog.module.css";

export const MAX_PHOTOS = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp";

interface Props {
  /** When set, changes are saved immediately; otherwise files are kept as `pending` until the product exists. */
  productId?: string;
  photos: PhotoDto[];
  onPhotosChange: (photos: PhotoDto[]) => void;
  pending: File[];
  onPendingChange: (files: File[]) => void;
  onError: (message: string) => void;
}

export function PhotoManager({ productId, photos, onPhotosChange, pending, onPendingChange, onError }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const previews = useMemo(() => pending.map((f) => URL.createObjectURL(f)), [pending]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const total = photos.length + pending.length;

  async function add(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const bad = files.find((f) => !ACCEPT.split(",").includes(f.type));
    if (bad) return onError(`${bad.name}: only JPG, PNG and WebP images are allowed.`);
    const big = files.find((f) => f.size > MAX_BYTES);
    if (big) return onError(`${big.name} is larger than 5 MB.`);
    if (total + files.length > MAX_PHOTOS) return onError(`A product can have at most ${MAX_PHOTOS} photos.`);

    if (!productId) return onPendingChange([...pending, ...files]);
    setBusy(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("file", f, f.name));
      const added = (await upload<{ data: PhotoDto[] }>(`/products/${productId}/photos`, fd)).data;
      onPhotosChange([...photos, ...added]);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function makePrimary(photo: PhotoDto) {
    setBusy(true);
    try {
      onPhotosChange((await api<{ data: PhotoDto[] }>(`/products/${productId}/photos/${photo.id}`, { method: "PATCH", body: { isPrimary: true } })).data);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo: PhotoDto) {
    setBusy(true);
    try {
      await api(`/products/${productId}/photos/${photo.id}`, { method: "DELETE" });
      const rest = photos.filter((p) => p.id !== photo.id);
      if (photo.isPrimary && rest[0]) rest[0] = { ...rest[0], isPrimary: true };
      onPhotosChange(rest);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void add(e.dataTransfer.files);
  }

  return (
    <div>
      <div
        className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p className={styles.dropzoneText}>
          Drag photos here, or choose files. JPG, PNG or WebP, up to 5 MB each, {MAX_PHOTOS} per product. The first photo is the primary one.
          <br />
          {total} of {MAX_PHOTOS} used{busy ? " · Saving…" : ""}
        </p>
        <Button kind="secondary" size="sm" onClick={() => uploadRef.current?.click()} disabled={busy || total >= MAX_PHOTOS}>
          Upload photos
        </Button>
        <Button kind="ghost" size="sm" onClick={() => cameraRef.current?.click()} disabled={busy || total >= MAX_PHOTOS}>
          Take photo
        </Button>
        <input
          ref={uploadRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept={ACCEPT}
          capture="environment"
          hidden
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {total > 0 ? (
        <ul className={styles.photoGrid} aria-label="Photos">
          {photos.map((p) => (
            <li key={p.id} className={`${styles.photo} ${p.isPrimary ? styles.photoPrimary : ""}`}>
              <img src={p.thumbnailUrl} alt="" className={styles.photoImg} />
              {p.isPrimary ? (
                <span className={styles.photoBadge}>
                  <Tag kind="blue">Primary</Tag>
                </span>
              ) : null}
              <div className={styles.photoActions}>
                <button type="button" onClick={() => makePrimary(p)} disabled={busy || p.isPrimary}>
                  Set primary
                </button>
                <button type="button" onClick={() => remove(p)} disabled={busy}>
                  Remove
                </button>
              </div>
            </li>
          ))}
          {pending.map((f, i) => (
            <li key={`${f.name}-${i}`} className={`${styles.photo} ${photos.length === 0 && i === 0 ? styles.photoPrimary : ""}`}>
              <img src={previews[i]} alt="" className={styles.photoImg} />
              <span className={styles.photoBadge}>
                <Tag kind={photos.length === 0 && i === 0 ? "blue" : "gray"}>{photos.length === 0 && i === 0 ? "Primary" : "Not saved yet"}</Tag>
              </span>
              <div className={styles.photoActions}>
                <button type="button" disabled={i === 0} onClick={() => onPendingChange([f, ...pending.filter((_, j) => j !== i)])}>
                  Set primary
                </button>
                <button type="button" onClick={() => onPendingChange(pending.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
