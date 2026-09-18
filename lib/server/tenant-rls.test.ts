import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The shared client and the tenant resolver are mocked so the flag logic is testable without a DB.
// vi.mock is hoisted above the imports, so the fakes it closes over must be hoisted too.
const { executed, client } = vi.hoisted(() => {
  const executed: unknown[] = [];
  const tx = { $executeRaw: vi.fn(async (...a: unknown[]) => { executed.push(a); return 1; }), tag: "tx" };
  const client = { $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)), tag: "shared" };
  return { executed, client };
});
vi.mock("./prisma", () => ({ prisma: async () => client }));
vi.mock("./tenant", () => ({ currentTenantId: async () => "acme" }));

import { withTenant, setTenantContext, rlsEnabled } from "./tenant-rls";

describe("tenant-rls (C4 Phase B plumbing, shipped dark)", () => {
  const prev = process.env.TENANT_RLS;
  beforeEach(() => { executed.length = 0; client.$transaction.mockClear(); });
  afterEach(() => { if (prev === undefined) delete process.env.TENANT_RLS; else process.env.TENANT_RLS = prev; });

  it("is OFF unless TENANT_RLS is exactly 'on'", () => {
    expect(rlsEnabled({})).toBe(false);
    expect(rlsEnabled({ TENANT_RLS: "" })).toBe(false);
    expect(rlsEnabled({ TENANT_RLS: "off" })).toBe(false);
    expect(rlsEnabled({ TENANT_RLS: "true" })).toBe(false);
    expect(rlsEnabled({ TENANT_RLS: " ON " })).toBe(true);
  });

  it("off: runs fn on the shared client with no transaction and no SET (today's behaviour)", async () => {
    delete process.env.TENANT_RLS;
    const seen = await withTenant(async (t) => (t as { tag: string }).tag);
    expect(seen).toBe("shared");
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(executed).toHaveLength(0);
  });

  it("on: opens ONE transaction, sets app.tenant_id with is_local=true, then runs fn on the tx client", async () => {
    process.env.TENANT_RLS = "on";
    const seen = await withTenant(async (t) => (t as { tag: string }).tag);
    expect(seen).toBe("tx");
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(executed).toHaveLength(1);
    // tagged template: strings + interpolated values
    const [strings, ...values] = executed[0] as [TemplateStringsArray, ...unknown[]];
    expect(strings.join("?")).toContain("set_config('app.tenant_id', ?, true)");
    expect(values).toEqual(["acme"]); // resolved from the request's tenant
  });

  it("on: an explicit tenantId (jobs / control plane) overrides the request tenant", async () => {
    process.env.TENANT_RLS = "on";
    await withTenant(async () => null, "globex");
    const [, ...values] = executed[0] as [TemplateStringsArray, ...unknown[]];
    expect(values).toEqual(["globex"]);
  });

  it("setTenantContext: no-op off; on, one set_config on the GIVEN tx (for functions with their own transaction)", async () => {
    const own = { $executeRaw: vi.fn(async (...a: unknown[]) => { executed.push(a); return 1; }) };
    delete process.env.TENANT_RLS;
    await setTenantContext(own);
    expect(own.$executeRaw).not.toHaveBeenCalled();
    process.env.TENANT_RLS = "on";
    await setTenantContext(own);
    expect(own.$executeRaw).toHaveBeenCalledTimes(1);
    expect(client.$transaction).not.toHaveBeenCalled(); // never opens its own transaction
    const [, ...values] = executed[0] as [TemplateStringsArray, ...unknown[]];
    expect(values).toEqual(["acme"]);
  });
});
