import { describe, it, expect } from "vitest";
import { isPrivateIp } from "./ssrf";

describe("isPrivateIp (SSRF egress guard)", () => {
  it("blocks loopback, private, CGNAT and link-local IPv4", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it("blocks the cloud metadata address specifically", () => {
    expect(isPrivateIp("169.254.169.254")).toBe(true); // AWS/GCP/Azure metadata
  });

  it("blocks multicast/reserved and malformed", () => {
    expect(isPrivateIp("224.0.0.1")).toBe(true);
    expect(isPrivateIp("255.255.255.255")).toBe(true);
    expect(isPrivateIp("not-an-ip")).toBe(true); // deny on parse failure
  });

  it("blocks private IPv6, loopback, and IPv4-mapped private", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "::ffff:10.0.0.1", "::ffff:169.254.169.254"]) {
      expect(isPrivateIp(ip)).toBe(true);
    }
  });

  it("allows genuine public addresses", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "140.82.121.4", "172.15.0.1", "172.32.0.1", "2606:4700:4700::1111"]) {
      expect(isPrivateIp(ip)).toBe(false);
    }
  });
});
