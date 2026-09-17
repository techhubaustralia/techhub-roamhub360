import { describe, it, expect } from "vitest";
import { buildAssetLinks, parseFingerprints, validPackageName, DEFAULT_ANDROID_PACKAGE } from "./assetlinks";

const FP1 = "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";
const FP2 = "aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99";

describe("parseFingerprints", () => {
  it("accepts comma/space/newline lists, upper-cases, de-duplicates, drops junk", () => {
    expect(parseFingerprints(`${FP1}, ${FP2}\n${FP1.toLowerCase()} not-a-fingerprint`)).toEqual([FP1, FP2.toUpperCase()]);
  });
  it("is empty for blank / undefined", () => {
    expect(parseFingerprints("")).toEqual([]);
    expect(parseFingerprints(undefined)).toEqual([]);
    expect(parseFingerprints("   ")).toEqual([]);
  });
  it("rejects a fingerprint with the wrong length or no colons", () => {
    expect(parseFingerprints(FP1.slice(0, -3))).toEqual([]);
    expect(parseFingerprints(FP1.replace(/:/g, ""))).toEqual([]);
  });
});

describe("validPackageName", () => {
  it("needs at least two dotted segments starting with a letter", () => {
    expect(validPackageName(DEFAULT_ANDROID_PACKAGE)).toBe(true);
    expect(validPackageName("com.example.app_2")).toBe(true);
    expect(validPackageName("roamhub")).toBe(false);
    expect(validPackageName("com.1abc.app")).toBe(false);
    expect(validPackageName("com..app")).toBe(false);
  });
});

describe("buildAssetLinks", () => {
  it("returns null when no fingerprint is configured (route answers 404)", () => {
    expect(buildAssetLinks(undefined, undefined)).toBeNull();
    expect(buildAssetLinks("com.x.y", "")).toBeNull();
  });
  it("returns null for an invalid package name even with fingerprints", () => {
    expect(buildAssetLinks("bad", FP1)).toBeNull();
  });
  it("builds the handle_all_urls statement with the default package", () => {
    expect(buildAssetLinks(" ", `${FP1},${FP2}`)).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: DEFAULT_ANDROID_PACKAGE, sha256_cert_fingerprints: [FP1, FP2.toUpperCase()] },
      },
    ]);
  });
  it("honours an explicit package name", () => {
    expect(buildAssetLinks("au.com.techhub.roamhub", FP1)![0].target.package_name).toBe("au.com.techhub.roamhub");
  });
});
