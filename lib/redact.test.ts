import { describe, it, expect } from "vitest";
import { redactEmail } from "./redact";

describe("redactEmail", () => {
  it("masks the local part but keeps first char + domain", () => {
    expect(redactEmail("abin.raju@mssodali.com")).toBe("a********@mssodali.com");
    expect(redactEmail("jo@x.io")).toBe("j**@x.io");
  });
  it("never leaks on missing/garbage input", () => {
    expect(redactEmail("")).toBe("***");
    expect(redactEmail(null)).toBe("***");
    expect(redactEmail("not-an-email")).toBe("***");
    expect(redactEmail("@nolocal.com")).toBe("***");
  });
});
