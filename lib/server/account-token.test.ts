import { describe, it, expect } from "vitest";
import { signPwToken, verifyPwToken } from "./account-token";

describe("account-token (set-password links)", () => {
  it("round-trips a valid token", () => {
    const t = signPwToken("user-123");
    const p = verifyPwToken(t);
    expect(p?.uid).toBe("user-123");
    expect(p?.purpose).toBe("set-password");
  });

  it("rejects a tampered payload", () => {
    const t = signPwToken("user-123");
    const [data, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "attacker", purpose: "set-password", exp: Date.now() + 1e6 })).toString("base64url");
    expect(verifyPwToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyPwToken(`${data}.deadbeef`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const t = signPwToken("user-123", -1000); // already expired
    expect(verifyPwToken(t)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifyPwToken("")).toBeNull();
    expect(verifyPwToken("not-a-token")).toBeNull();
    expect(verifyPwToken("a.b.c")).toBeNull();
  });
});
