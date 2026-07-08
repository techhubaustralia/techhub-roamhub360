import "server-only";

// Tiny in-process pub/sub for real-time updates (SSE). The app runs as a single standalone
// instance, so an in-memory bus reaches every connected client without external infra (no Redis).
// Kept on globalThis so it survives module dedup / HMR. Tenant-scoped — a publish only reaches
// subscribers of the same tenant.
type Listener = (event: string) => void;

const store = globalThis as unknown as { __rhLiveSubs?: Map<string, Set<Listener>> };
const subs: Map<string, Set<Listener>> = store.__rhLiveSubs ?? (store.__rhLiveSubs = new Map());

export function subscribeLive(tenantId: string, cb: Listener): () => void {
  let set = subs.get(tenantId);
  if (!set) subs.set(tenantId, (set = new Set()));
  set.add(cb);
  return () => {
    set!.delete(cb);
    if (!set!.size) subs.delete(tenantId);
  };
}

export function publishLive(tenantId: string, event: string): void {
  subs.get(tenantId)?.forEach((cb) => {
    try {
      cb(event);
    } catch {
      /* a dead listener must not break others */
    }
  });
}
