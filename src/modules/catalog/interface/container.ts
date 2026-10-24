import { prisma } from "@/shared/db/prisma";
import { storage } from "@/shared/storage/storage";
import { processImage } from "@/shared/storage/images";
import { ImportService } from "../application/import.service";
import { PhotoService } from "../application/photo.service";
import { ProductService } from "../application/product.service";
import { ReferenceService } from "../application/reference.service";
import { excelSpreadsheet } from "../infrastructure/excel";
import { prismaCatalogUnitOfWork } from "../infrastructure/prisma-catalog.repositories";

/** Composition root of the catalog module. */
function build() {
  const uow = prismaCatalogUnitOfWork(prisma);
  const files = storage();
  return {
    references: new ReferenceService({ uow }),
    products: new ProductService({ uow }),
    photos: new PhotoService({ uow, files, images: { process: processImage } }),
    imports: new ImportService({ uow, files, sheets: excelSpreadsheet }),
    files,
  };
}

let instance: ReturnType<typeof build> | undefined;

export function catalog() {
  return (instance ??= build());
}
