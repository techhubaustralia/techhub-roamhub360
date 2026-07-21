// Trust the BYTES, not the client's declared MIME type. A floor-plan upload previously stored
// whatever Content-Type the browser sent and served it back inline — so an SVG or HTML file
// disguised as an image became stored XSS. This sniffs the real container from magic bytes and
// returns a safe, fixed content-type, or null to reject. Only raster formats the browser renders
// as an image (never SVG, which is active content).

export const MAX_PLAN_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB — a floor plan, not a video

/** The real image type from the file's leading bytes, or null if it isn't a JPEG/PNG/WebP. */
export function sniffImageType(buf: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  const b = buf;
  // JPEG: FF D8 FF
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  // WebP: "RIFF" .... "WEBP"
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}
