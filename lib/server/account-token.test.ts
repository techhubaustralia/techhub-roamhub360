import { describe, it, expect } from "vitest";
import { signPwToken, verifyPwToken, pwFingerprint } from "./account-token";

describe("account-token (set-password links)", () => {
  const fp = pwFingerprint(null); // invited/passwordless user

  it("round-trips a valid token with its credential fingerprint", () => {
    const t = signPwToken("user-123", fp);
    const p = verifyPwToken(t);
    expect(p?.uid).toBe("user-123");
    expect(p?.purpose).toBe("set-password");
    expect(p?.fp).toBe(fp);
  });

  it("fingerprints change when the password hash changes (single-use)", () => {
    expect(pwFingerprint(null)).not.toBe(pwFingerprint("$2a$10$somehash"));
    expect(pwFingerprint("$2a$10$a")).not.toBe(pwFingerprint("$2a$10$b"));
    expect(pwFingerprint("$2a$10$a")).toBe(pwFingerprint("$2a$10$a")); // deterministic
  });

  it("rejects a tampered payload", () => {
    const t = signPwToken("user-123", fp);
    const [data, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "attacker", purpose: "set-password", exp: Date.now() + 1e6, fp })).toString("base64url");
    expect(verifyPwToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyPwToken(`${data}.deadbeef`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = signPwToken("user-123", fp, -1000); // already expired
    expect(verifyPwToken(t)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyPwToken("")).toBeNull();
    expect(verifyPwToken("not-a-token")).toBeNull();
    expect(verifyPwToken("a.b.c")).toBeNull();
  });
});
