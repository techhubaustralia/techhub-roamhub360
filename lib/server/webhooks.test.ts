import { describe, it, expect } from "vitest";
import { safeWebhookUrl } from "./webhooks";

describe("safeWebhookUrl (SSRF guard)", () => {
  it("accepts a normal public https endpoint", () => {
    expect(safeWebhookUrl("https://example.com/hooks/roamhub")).toBe("https://example.com/hooks/roamhub");
    expect(safeWebhookUrl("https://api.acme.com.au/wh?x=1")).toContain("https://api.acme.com.au/wh");
  });

  it("rejects plain http", () => {
    expect(safeWebhookUrl("http://example.com/hook")).toBeNull();
  });

  it("rejects localhost and internal-looking hosts", () => {
    expect(safeWebhookUrl("https://localhost/hook")).toBeNull();
    expect(safeWebhookUrl("https://foo.localhost/hook")).toBeNull();
    expect(safeWebhookUrl("https://db.internal/hook")).toBeNull();
    expect(safeWebhookUrl("https://nas.local/hook")).toBeNull();
    expect(safeWebhookUrl("https://router.lan/hook")).toBeNull();
    expect(safeWebhookUrl("https://intranet/hook")).toBeNull(); // no dot = internal name
  });

  it("rejects IP literals (v4 and v6)", () => {
    expect(safeWebhookUrl("https://127.0.0.1/hook")).toBeNull();
    expect(safeWebhookUrl("https://10.0.0.5/hook")).toBeNull();
    expect(safeWebhookUrl("https://192.168.1.1/hook")).toBeNull();
    expect(safeWebhookUrl("https://169.254.169.254/latest/meta-data")).toBeNull(); // cloud metadata
    expect(safeWebhookUrl("https://[::1]/hook")).toBeNull();
  });

  it("rejects embedded credentials and garbage", () => {
    expect(safeWebhookUrl("https://user:pass@example.com/hook")).toBeNull();
    expect(safeWebhookUrl("not a url")).toBeNull();
    expect(safeWebhookUrl("ftp://example.com/hook")).toBeNull();
  });

  it("enforces a required host (Slack)", () => {
    expect(safeWebhookUrl("https://hooks.slack.com/services/T/B/x", { requireHost: "hooks.slack.com" })).toContain("hooks.slack.com");
    expect(safeWebhookUrl("https://evil.com/services/T/B/x", { requireHost: "hooks.slack.com" })).toBeNull();
  });
});
