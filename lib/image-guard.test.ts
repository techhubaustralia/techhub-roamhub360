import { describe, it, expect } from "vitest";
import { sniffImageType } from "./image-guard";

const bytes = (...n: number[]) => new Uint8Array(n);

describe("sniffImageType", () => {
  it("detects real JPEG/PNG/WebP magic bytes", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });

  it("rejects SVG and HTML disguised as an image (the stored-XSS vector)", () => {
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>");
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    expect(sniffImageType(svg)).toBeNull();
    expect(sniffImageType(html)).toBeNull();
  });

  it("rejects truncated/empty and near-miss signatures", () => {
    expect(sniffImageType(bytes())).toBeNull();
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull(); // JPEG needs 3 bytes
    expect(sniffImageType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20))).toBeNull(); // RIFF but AVI, not WEBP
  });
});
