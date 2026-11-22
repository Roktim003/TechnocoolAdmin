// Builds src/shared/brand/letterhead-data.ts from public/brand/letterhead.png (the company pad,
// A4 portrait). Run after replacing that image:
//
//   node scripts/build-letterhead.mjs
//
// The pad is embedded in server-rendered PDFs as data URIs so the worker needs no file access.
// Wide reports print in landscape, so a landscape pad is composed from the same artwork: the
// header at the top right, the watermark in the middle, the "20 years" mark at the lower right,
// and the dealer band centred at the bottom.
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const SOURCE = "public/brand/letterhead.png";
const TARGET = "src/shared/brand/letterhead-data.ts";
/** A4 at 200 dpi: enough for print, small enough to embed in every PDF. */
const MAX_WIDTH = 1654;
const JPEG = { quality: 88, mozjpeg: true };

const portrait = await sharp(SOURCE).flatten({ background: "#ffffff" }).resize({ width: MAX_WIDTH, withoutEnlargement: true }).png().toBuffer();
const { width: W, height: H } = await sharp(portrait).metadata();

// Regions of the portrait artwork, as fractions of its width / height.
const px = (fx, fy, fw, fh) => ({ left: Math.round(fx * W), top: Math.round(fy * H), width: Math.round(fw * W), height: Math.round(fh * H) });
const HEADER = px(0.44, 0, 0.56, 0.1);
const WATERMARK = px(0.33, 0.375, 0.34, 0.25);
const YEARS = px(0.68, 0.735, 0.32, 0.165);
const BAND = px(0, 0.915, 1, 0.085);
const crop = (region) => sharp(portrait).extract(region).toBuffer();

// Landscape canvas at the same scale: the portrait's height becomes the width.
const LW = H;
const LH = W;
const paper = (await sharp(portrait).extract({ left: Math.round(W * 0.1), top: Math.round(H * 0.3), width: 1, height: 1 }).raw().toBuffer()).subarray(0, 3);
const side = Math.floor((LW - W) / 2);
const landscape = await sharp({ create: { width: LW, height: LH, channels: 3, background: { r: paper[0], g: paper[1], b: paper[2] } } })
  .composite([
    { input: await crop(HEADER), left: LW - HEADER.width, top: 0 },
    { input: await crop(WATERMARK), left: Math.round((LW - WATERMARK.width) / 2), top: Math.round((LH - WATERMARK.height) / 2) },
    { input: await crop(YEARS), left: LW - YEARS.width, top: LH - BAND.height - YEARS.height - Math.round(LH * 0.035) },
    { input: await crop(BAND), left: side, top: LH - BAND.height },
  ])
  .png()
  .toBuffer();

const jpeg = async (buffer) => (await sharp(buffer).jpeg(JPEG).toBuffer()).toString("base64");
const portraitJpeg = await jpeg(portrait);
const landscapeJpeg = await jpeg(landscape);

writeFileSync(
  TARGET,
  `// Generated from ${SOURCE} by scripts/build-letterhead.mjs. The company pad printed behind PDFs:\n` +
    `// the portrait artwork (${W}×${H}) and a landscape pad (${LW}×${LH}) composed from it. Regenerate if the pad changes.\n` +
    `export const LETTERHEAD_DATA_URI = "data:image/jpeg;base64,${portraitJpeg}";\n` +
    `export const LETTERHEAD_LANDSCAPE_DATA_URI = "data:image/jpeg;base64,${landscapeJpeg}";\n`,
);
if (process.argv[2]) writeFileSync(process.argv[2], landscape);
console.log(`${TARGET}: portrait ${W}×${H} ${Math.round(portraitJpeg.length / 1366)} KB, landscape ${LW}×${LH} ${Math.round(landscapeJpeg.length / 1366)} KB`);
