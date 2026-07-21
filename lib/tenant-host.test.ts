import { describe, it, expect } from "vitest";
import { tenantFromHost, requestHost } from "./tenant-host";

describe("tenantFromHost", () => {
  it("maps a customer subdomain to its slug", () => {
    expect(tenantFromHost("test123.roamhub360.com")).toBe("test123");
    expect(tenantFromHost("acme.roamhub360.com")).toBe("acme");
  });

  it("maps the main host and reserved subdomains to default", () => {
    expect(tenantFromHost("app.roamhub360.com")).toBe("default");
    expect(tenantFromHost("www.roamhub360.com")).toBe("default");
    expect(tenantFromHost("roamhub360.com")).toBe("default");
  });

  it("handles ports, IPs, localhost, and x-forwarded-host lists", () => {
    expect(tenantFromHost("test123.roamhub360.com:443")).toBe("test123");
    expect(tenantFromHost("localhost:3000")).toBe("default");
    expect(tenantFromHost("168.144.169.195")).toBe("default");
    expect(tenantFromHost("test123.roamhub360.com, app.roamhub360.com")).toBe("test123"); // first wins
    expect(tenantFromHost("")).toBe("default");
  });

  it("is case-insensitive", () => {
    expect(tenantFromHost("Test123.RoamHub360.com")).toBe("test123");
  });

  it("refuses hosts outside the trusted apex (H1: spoofed Host can't impersonate a tenant)", () => {
    expect(tenantFromHost("victim.evil.com")).toBe("default");
    expect(tenantFromHost("test123.attacker.net")).toBe("default");
    expect(tenantFromHost("roamhub360.com.evil.com")).toBe("default");
  });
});

describe("requestHost", () => {
  const req = (h: Record<string, string>) => ({ headers: { get: (k: string) => h[k.toLowerCase()] ?? null } });

  it("prefers x-forwarded-host over host", () => {
    expect(requestHost(req({ "x-forwarded-host": "test123.roamhub360.com", host: "127.0.0.1:3000" }))).toBe("test123.roamhub360.com");
  });

  it("falls back to host, and takes the first of a forwarded list", () => {
    expect(requestHost(req({ host: "app.roamhub360.com" }))).toBe("app.roamhub360.com");
    expect(requestHost(req({ "x-forwarded-host": "acme.roamhub360.com, proxy.internal" }))).toBe("acme.roamhub360.com");
  });

  it("round-trips through tenantFromHost for isolation checks", () => {
    expect(tenantFromHost(requestHost(req({ "x-forwarded-host": "test123.roamhub360.com" })))).toBe("test123");
  });
});
