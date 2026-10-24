import { randomUUID } from "node:crypto";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/errors/app-error";
import { logger } from "@/shared/logger/logger";
import { hasLevel } from "@/shared/rbac/levels";
import { assertCanAddPhotos, MAX_PHOTOS_PER_PRODUCT } from "../domain/rules";
import type { Product, ProductPhoto } from "../domain/types";
import type { CatalogActor, CatalogUnitOfWork, FileStore, ImageProcessor } from "./ports";

export interface UploadedFile {
  name: string;
  bytes: Uint8Array;
}

const photoSnapshot = (p: ProductPhoto) => ({ id: p.id, isPrimary: p.isPrimary, sortOrder: p.sortOrder, contentType: p.contentType, sizeBytes: p.sizeBytes });

export class PhotoService {
  constructor(private readonly d: { uow: CatalogUnitOfWork; files: FileStore; images: ImageProcessor }) {}

  private async product(id: string): Promise<Product> {
    const p = await this.d.uow.repos.products.findById(id);
    if (!p) throw new NotFoundError("Product");
    return p;
  }

  /**
   * FULL may manage photos of any product. CREATE may manage photos of products they created,
   * so the person adding a product can attach its photos right after saving it.
   */
  private assertCanManage(actor: CatalogActor, product: Product): void {
    if (hasLevel(actor.level, "FULL")) return;
    if (hasLevel(actor.level, "CREATE") && product.createdBy?.id === actor.actorId) return;
    throw new ForbiddenError("This action requires FULL access to Product catalog.");
  }

  /** Validates every file by content first, then stores originals + thumbnails, then saves rows. */
  async upload(actor: CatalogActor, productId: string, files: UploadedFile[]): Promise<ProductPhoto[]> {
    if (files.length === 0) throw new ValidationError("Attach at least one photo.", [{ path: "file", message: "Attach at least one photo." }]);
    if (files.length > MAX_PHOTOS_PER_PRODUCT) assertCanAddPhotos(0, files.length);
    const product = await this.product(productId);
    this.assertCanManage(actor, product);
    assertCanAddPhotos(product.photos.length, files.length);

    const processed: { id: string; image: Awaited<ReturnType<ImageProcessor["process"]>> }[] = [];
    for (const f of files) processed.push({ id: randomUUID(), image: await this.d.images.process(f.bytes, f.name || "Photo") });

    const keys: string[] = [];
    try {
      for (const { id, image } of processed) {
        const original = `products/${productId}/${id}.${image.ext}`;
        const thumb = `products/${productId}/${id}_thumb.webp`;
        await this.d.files.put(original, image.original, image.contentType);
        keys.push(original);
        await this.d.files.put(thumb, image.thumbnail, "image/webp");
        keys.push(thumb);
      }

      return await this.d.uow.transaction(async (r) => {
        const existing = await r.photos.listForProduct(productId);
        assertCanAddPhotos(existing.length, processed.length);
        const created: ProductPhoto[] = [];
        for (const [i, { id, image }] of processed.entries()) {
          created.push(
            await r.photos.create({
              id,
              productId,
              storageKey: `products/${productId}/${id}.${image.ext}`,
              thumbnailKey: `products/${productId}/${id}_thumb.webp`,
              contentType: image.contentType,
              sizeBytes: image.original.byteLength,
              width: image.width,
              height: image.height,
              isPrimary: existing.length === 0 && i === 0,
              sortOrder: existing.length + i,
              createdById: actor.actorId,
            }),
          );
        }
        await r.audit.record(actor, { action: "product.photo_add", entityType: "Product", entityId: productId, after: { photos: created.map(photoSnapshot) } });
        return created;
      });
    } catch (err) {
      await this.d.files.delete(keys).catch((e) => logger.warn({ err: e }, "orphan photo cleanup failed"));
      throw err;
    }
  }

  /** Sets the primary photo and/or moves a photo to a new position. */
  async update(actor: CatalogActor, productId: string, photoId: string, input: { isPrimary?: true; sortOrder?: number }): Promise<ProductPhoto[]> {
    const product = await this.product(productId);
    this.assertCanManage(actor, product);
    return this.d.uow.transaction(async (r) => {
      const photos = await r.photos.listForProduct(productId);
      const target = photos.find((p) => p.id === photoId);
      if (!target) throw new NotFoundError("Photo");

      const order = photos.map((p) => p.id).filter((id) => id !== photoId);
      const position = input.sortOrder === undefined ? photos.indexOf(target) : Math.min(input.sortOrder, order.length);
      order.splice(position, 0, photoId);
      const primaryId = input.isPrimary ? photoId : (photos.find((p) => p.isPrimary)?.id ?? order[0] ?? null);

      await r.photos.arrange(productId, order, primaryId);
      const after = await r.photos.listForProduct(productId);
      await r.audit.record(actor, {
        action: "product.photo_update",
        entityType: "Product",
        entityId: productId,
        before: { photos: photos.map(photoSnapshot) },
        after: { photos: after.map(photoSnapshot) },
      });
      return after;
    });
  }

  /** Removes a photo. If it was primary, the first remaining photo becomes primary. */
  async remove(actor: CatalogActor, productId: string, photoId: string): Promise<void> {
    const product = await this.product(productId);
    this.assertCanManage(actor, product);
    const removed = await this.d.uow.transaction(async (r) => {
      const photos = await r.photos.listForProduct(productId);
      const target = photos.find((p) => p.id === photoId);
      if (!target) throw new NotFoundError("Photo");
      await r.photos.delete(photoId);
      const rest = photos.filter((p) => p.id !== photoId);
      const primaryId = target.isPrimary ? (rest[0]?.id ?? null) : (rest.find((p) => p.isPrimary)?.id ?? null);
      await r.photos.arrange(productId, rest.map((p) => p.id), primaryId);
      await r.audit.record(actor, { action: "product.photo_remove", entityType: "Product", entityId: productId, before: { photo: photoSnapshot(target) } });
      return target;
    });
    await this.d.files.delete([removed.storageKey, removed.thumbnailKey]).catch((err) => logger.warn({ err, photoId }, "photo object delete failed"));
  }

  async file(productId: string, photoId: string, variant: "original" | "thumb") {
    const photo = await this.d.uow.repos.photos.findById(productId, photoId);
    if (!photo) throw new NotFoundError("Photo");
    const obj = await this.d.files.get(variant === "thumb" ? photo.thumbnailKey : photo.storageKey);
    if (!obj) throw new NotFoundError("Photo file");
    return { ...obj, fileName: `${photo.id}${variant === "thumb" ? "_thumb.webp" : `.${photo.contentType.split("/")[1]?.replace("jpeg", "jpg")}`}` };
  }
}
