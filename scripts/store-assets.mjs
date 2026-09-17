// Render the Google Play listing assets from their SVG sources with sharp (already a dependency).
//   node scripts/store-assets.mjs
// Writes to store/out/:  feature-graphic.png (1024×500), icon-512.png (hi-res icon, from public/icons).
// Phone screenshots are NOT generated here — take them from the deployed app (see
// PROJECT_HANDOVER/21_ANDROID_APP.md §6).
import { mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "store", "out");
await mkdir(out, { recursive: true });

const feature = path.join(root, "store", "feature-graphic.svg");
await sharp(feature, { density: 144 }).resize(1024, 500).png({ compressionLevel: 9 }).toFile(path.join(out, "feature-graphic.png"));
console.log("wrote store/out/feature-graphic.png (1024×500)");

await copyFile(path.join(root, "public", "icons", "icon-512.png"), path.join(out, "icon-512.png"));
console.log("wrote store/out/icon-512.png (512×512, from public/icons)");
