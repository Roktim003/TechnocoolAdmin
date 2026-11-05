/**
 * Sample imported GRN for demo installs (SEED_SAMPLE_DATA not "false"), created once: a Daikin
 * shipment with all five import documents (BL, CO, PL, CI, B/E) and a small sample file for each,
 * posted through the real services (documents checklist, file rules, posting engine).
 * Runs after the purchasing sample, which creates the Daikin product. Skipped (logged) when the
 * product, supplier or file storage isn't available.
 */
import sharp from "sharp";
import type { PrismaClient } from "@prisma/client";
import { AttachmentService } from "@/modules/inventory/application/attachment.service";
import { EntryService } from "@/modules/inventory/application/entry.service";
import { StockPostingService } from "@/modules/inventory/application/posting.service";
import type { InventoryActor } from "@/modules/inventory/application/ports";
import { prismaInventoryUnitOfWork } from "@/modules/inventory/infrastructure/prisma-inventory.store";
import { ADMIN_ROLE_NAME } from "@/modules/identity/domain/seed-roles";
import { roleNameKey } from "@/modules/identity/domain/rules";
import { makeThumbnail } from "@/shared/storage/images";
import { storage } from "@/shared/storage/storage";

const SAMPLE_BL = "MAEU-240915377";

/** A one-page PDF with a title line (enough for a viewer to open). */
function samplePdf(title: string): Uint8Array {
  const text = title.replace(/[()\\]/g, "");
  const stream = `BT /F1 18 Tf 72 760 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

export async function seedSampleImport(prisma: PrismaClient, log: (msg: string) => void) {
  if (await prisma.importShipment.findFirst({ where: { blNo: SAMPLE_BL } })) return;
  const admin = await prisma.user.findFirst({ where: { role: { nameKey: roleNameKey(ADMIN_ROLE_NAME) } }, include: { warehouses: true }, orderBy: { createdAt: "asc" } });
  const warehouse = await prisma.warehouse.findFirst({ orderBy: { code: "asc" } });
  const daikin = await prisma.supplier.findFirst({ where: { name: "Daikin Airconditioning (Thailand)" } });
  const product = await prisma.product.findUnique({ where: { code: "DK-FXFQ63AVM" } });
  if (!admin || !warehouse || !daikin || !product) return;

  const inv: InventoryActor = { actorId: admin.id, name: admin.name, ip: null, requestId: "seed", level: "FULL", warehouseIds: admin.warehouses.map((w) => w.warehouseId), canSeeCost: true, canSeeProfit: true, isAdmin: true };
  const uow = prismaInventoryUnitOfWork(prisma);
  const entries = new EntryService({ uow, posting: new StockPostingService() });
  const files = new AttachmentService({ uow, files: storage(), entries, thumbnail: makeThumbnail });
  const day = (offset: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date(Date.now() + offset * 86_400_000));

  try {
    const e = await entries.create(inv, {
      action: "draft",
      type: "GRN_IMPORT",
      warehouseId: warehouse.id,
      supplierId: daikin.id,
      currency: "USD",
      exchangeRate: "122.50",
      lcNo: "LC-0726-DBBL-1188",
      supplierInvoiceNo: "DK-EXP-77120",
      lines: [{ productId: product.id, qty: "4", unitPrice: "1150" }],
      charges: [
        { type: "CUSTOMS_DUTY", mode: "PERCENT_OF_GOODS", value: "10", includeInCost: true, label: null },
        { type: "CNF", mode: "AMOUNT_BDT", value: "18000", includeInCost: true, label: null },
        { type: "IMPORT_VAT", mode: "PERCENT_OF_GOODS", value: "15", includeInCost: false, label: null },
      ],
      importShipment: {
        blNo: SAMPLE_BL,
        blDate: day(-20),
        shippingLine: "Maersk Line",
        vesselVoyage: "MAERSK SEMARANG / 242E",
        portOfLoading: "Laem Chabang, Thailand",
        portOfDischarge: "Chattogram, Bangladesh",
        containerNumbers: ["MSKU7240391"],
        coNo: "TH-CO-2611-0458",
        coDate: day(-22),
        countryOfOrigin: "Thailand",
        coIssuingAuthority: "Thai Chamber of Commerce",
        plNo: "DK-PL-77120",
        plDate: day(-23),
        packageCount: 4,
        grossWeightKg: "212.000",
        netWeightKg: "188.000",
        ciNo: "DK-EXP-77120",
        ciDate: day(-23),
        ciCurrency: "USD",
        ciValue: "4600.00",
        incoterm: "CIF",
        boeNo: "C-2026-118804",
        boeDate: day(-6),
        customsStation: "Chattogram Custom House",
      },
    } as never);

    const scan = new Uint8Array(await sharp({ create: { width: 900, height: 600, channels: 3, background: "#f4f4f4" } }).png().toBuffer());
    for (const [docType, label] of [
      ["BL", "Bill of Lading"],
      ["CO", "Certificate of Origin"],
      ["PL", "Packing List"],
      ["CI", "Commercial Invoice"],
      ["BOE", "Bill of Entry"],
    ] as const) {
      await files.upload(inv, e.id, [{ name: `${docType}-${label.replace(/\s+/g, "-")}.pdf`, bytes: samplePdf(`${label} - sample document`) }], null, docType);
    }
    await files.upload(inv, e.id, [{ name: "BOE-stamped-copy.png", bytes: scan }], null, "BOE");

    const posted = await entries.postDraft(inv, e.id);
    log(`imports: sample imported GRN ${posted.number} with all five documents`);
  } catch (err) {
    log(`imports: skipped the sample imported GRN (${(err as Error).message})`);
  }
}
