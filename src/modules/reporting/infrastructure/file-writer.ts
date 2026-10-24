import type { ReportFileWriter } from "../application/ports";
import { writePdf } from "./pdf-writer";
import { writeXlsx } from "./xlsx-writer";

export const reportFileWriter: ReportFileWriter = { xlsx: writeXlsx, pdf: writePdf };
