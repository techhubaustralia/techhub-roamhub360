import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import type { FloorPlan } from "@/lib/types";
import { currentTenantId, DEFAULT_TENANT } from "./tenant";

// Floor plans + custom-building index + images.
// Prod: Azure Blob (AZURE_STORAGE_CONNECTION_STRING). Droplet/dev: local JSON files.
// Relational data (bookings/locks/audit) lives in Postgres — see lib/server/db.ts.
//
// MULTI-TENANCY: every object is namespaced by tenant — blobs as `<tenant>/<name>`,
// files under `data/<tenant>/…`. Writes always go to the tenant path. Reads for the
// DEFAULT tenant fall back to the legacy unprefixed path, so pre-tenancy data stays
// readable and migrates lazily on the next save (no data-move step needed).

export interface FloorRoom {
  id: string; // `${buildingId}__${slug}` (or the buildingId itself for legacy single-floor)
  name: string;
  type: "floor" | "room" | "parking";
  isDefault?: boolean;
}
export interface CustomBuilding {
  id: string;
  name: string;
  region?: string;
  country?: string;
  floors?: FloorRoom[];
}

const CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER = process.env.AZURE_STORAGE_CONTAINER || "plans";
const useBlob = Boolean(CONN);

// ---------- Blob backend ----------
let _container: ContainerClient | null = null;
async function container(): Promise<ContainerClient> {
  if (!_container) {
    const svc = BlobServiceClient.fromConnectionString(CONN!);
    _container = svc.getContainerClient(CONTAINER);
    await _container.createIfNotExists();
  }
  return _container;
}
async function blobJson<T>(name: string): Promise<T | null> {
  const c = await container();
  const b = c.getBlockBlobClient(name);
  if (!(await b.exists())) return null;
  const buf = await b.downloadToBuffer();
  return JSON.parse(buf.toString("utf8")) as T;
}
async function putBlobJson(name: string, data: unknown): Promise<void> {
  const c = await container();
  const body = JSON.stringify(data);
  await c.getBlockBlobClient(name).upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
}

// ---------- File backend ----------
const DATA_DIR = path.join(process.cwd(), "data");
async function readFileJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}
async function writeFileJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// ---------- tenant-aware read (with default-tenant legacy fallback) ----------
async function readJsonT<T>(t: string, blobName: string, fileRel: string): Promise<T | null> {
  if (useBlob) {
    const v = await blobJson<T>(`${t}/${blobName}`);
    return v !== null ? v : t === DEFAULT_TENANT ? blobJson<T>(blobName) : null;
  }
  const v = await readFileJson<T>(path.join(DATA_DIR, t, fileRel));
  return v !== null ? v : t === DEFAULT_TENANT ? readFileJson<T>(path.join(DATA_DIR, fileRel)) : null;
}

async function writeBuildings(t: string, list: CustomBuilding[]): Promise<void> {
  if (useBlob) await putBlobJson(`${t}/_buildings.json`, list);
  else await writeFileJson(path.join(DATA_DIR, t, "buildings.json"), list);
}
async function writeHidden(t: string, list: string[]): Promise<void> {
  if (useBlob) await putBlobJson(`${t}/_hidden.json`, list);
  else await writeFileJson(path.join(DATA_DIR, t, "_hidden.json"), list);
}

// ---------- Public API (tenant + backend agnostic) ----------
// Generic tenant-scoped JSON blob — same dual backend (Azure Blob / DATA_DIR) as everything else.
// Used for small operational state (e.g. web-push subscriptions) that doesn't warrant a DB table.
export async function getTenantJson<T>(name: string): Promise<T | null> {
  const t = await currentTenantId();
  return readJsonT<T>(t, `${name}.json`, `${name}.json`);
}
export async function setTenantJson(name: string, data: unknown): Promise<void> {
  const t = await currentTenantId();
  if (useBlob) await putBlobJson(`${t}/${name}.json`, data);
  else await writeFileJson(path.join(DATA_DIR, t, `${name}.json`), data);
}

export async function getStoredPlan(id: string): Promise<FloorPlan | null> {
  const t = await currentTenantId();
  return readJsonT<FloorPlan>(t, `${id}.json`, `plan-${id}.json`);
}
export async function putPlan(plan: FloorPlan): Promise<void> {
  const t = await currentTenantId();
  if (useBlob) await putBlobJson(`${t}/${plan.id}.json`, plan);
  else await writeFileJson(path.join(DATA_DIR, t, `plan-${plan.id}.json`), plan);
}
export async function deletePlan(id: string): Promise<void> {
  const t = await currentTenantId();
  if (useBlob) {
    const c = await container();
    await c.getBlockBlobClient(`${t}/${id}.json`).deleteIfExists();
    if (t === DEFAULT_TENANT) await c.getBlockBlobClient(`${id}.json`).deleteIfExists();
  } else {
    await fs.rm(path.join(DATA_DIR, t, `plan-${id}.json`), { force: true });
    if (t === DEFAULT_TENANT) await fs.rm(path.join(DATA_DIR, `plan-${id}.json`), { force: true });
  }
}
export async function listCustomBuildings(): Promise<CustomBuilding[]> {
  const t = await currentTenantId();
  return (await readJsonT<CustomBuilding[]>(t, "_buildings.json", "buildings.json")) ?? [];
}
export async function addCustomBuilding(b: CustomBuilding): Promise<void> {
  const t = await currentTenantId();
  const list = (await listCustomBuildings()).filter((x) => x.id !== b.id);
  list.push(b);
  await writeBuildings(t, list);
}

/** Floors/rooms for a building. Legacy buildings (no floors stored) resolve to a
 *  single default floor whose id IS the buildingId, so existing plans keep working. */
export async function listFloors(buildingId: string): Promise<FloorRoom[]> {
  const b = (await listCustomBuildings()).find((x) => x.id === buildingId);
  const fl = b?.floors ?? [];
  if (fl.length) return fl.some((f) => f.isDefault) ? fl : fl.map((f, i) => ({ ...f, isDefault: i === 0 }));
  return [{ id: buildingId, name: "Main floor", type: "floor", isDefault: true }];
}

export async function setFloors(buildingId: string, floors: FloorRoom[]): Promise<void> {
  const t = await currentTenantId();
  const list = await listCustomBuildings();
  const i = list.findIndex((b) => b.id === buildingId);
  if (i < 0) return;
  const norm = floors.length && !floors.some((f) => f.isDefault) ? floors.map((f, j) => ({ ...f, isDefault: j === 0 })) : floors;
  list[i] = { ...list[i], floors: norm };
  await writeBuildings(t, list);
}

/** Keep a custom building's name/region/country in step with its saved plan. */
export async function syncCustomBuildingMeta(plan: { id: string; name?: string; region?: string; country?: string }): Promise<void> {
  const t = await currentTenantId();
  const list = await listCustomBuildings();
  const i = list.findIndex((b) => b.id === plan.id);
  if (i < 0) return; // built-in; region/country come from static data
  list[i] = { ...list[i], name: plan.name || list[i].name, region: plan.region, country: plan.country };
  await writeBuildings(t, list);
}

// ---------- floor-plan background images (binary) ----------
export async function putPlanImage(id: string, buf: Buffer, contentType: string): Promise<void> {
  const t = await currentTenantId();
  if (useBlob) {
    const c = await container();
    await c.getBlockBlobClient(`${t}/img-${id}`).uploadData(buf, { blobHTTPHeaders: { blobContentType: contentType } });
  } else {
    const dir = path.join(DATA_DIR, t);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `img-${id}.bin`), buf);
    await fs.writeFile(path.join(dir, `img-${id}.type`), contentType, "utf8");
  }
}

export async function deletePlanImage(id: string): Promise<void> {
  const t = await currentTenantId();
  if (useBlob) {
    const c = await container();
    await c.getBlockBlobClient(`${t}/img-${id}`).deleteIfExists();
    if (t === DEFAULT_TENANT) await c.getBlockBlobClient(`img-${id}`).deleteIfExists();
  } else {
    await fs.rm(path.join(DATA_DIR, t, `img-${id}.bin`), { force: true });
    await fs.rm(path.join(DATA_DIR, t, `img-${id}.type`), { force: true });
    if (t === DEFAULT_TENANT) {
      await fs.rm(path.join(DATA_DIR, `img-${id}.bin`), { force: true });
      await fs.rm(path.join(DATA_DIR, `img-${id}.type`), { force: true });
    }
  }
}

export async function getPlanImage(id: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const t = await currentTenantId();
  if (useBlob) {
    const c = await container();
    for (const name of [`${t}/img-${id}`, ...(t === DEFAULT_TENANT ? [`img-${id}`] : [])]) {
      const b = c.getBlockBlobClient(name);
      if (await b.exists()) {
        const buffer = await b.downloadToBuffer();
        const props = await b.getProperties();
        return { buffer, contentType: props.contentType || "application/octet-stream" };
      }
    }
    return null;
  }
  const dirs = [path.join(DATA_DIR, t), ...(t === DEFAULT_TENANT ? [DATA_DIR] : [])];
  for (const dir of dirs) {
    try {
      const buffer = await fs.readFile(path.join(dir, `img-${id}.bin`));
      const contentType = await fs.readFile(path.join(dir, `img-${id}.type`), "utf8").catch(() => "application/octet-stream");
      return { buffer, contentType };
    } catch {
      // try next location
    }
  }
  return null;
}

// ---------- building removal (custom = remove, built-in = hide) ----------
export async function removeCustomBuilding(id: string): Promise<void> {
  const t = await currentTenantId();
  const list = (await listCustomBuildings()).filter((x) => x.id !== id);
  await writeBuildings(t, list);
}

export async function listHiddenBuildings(): Promise<string[]> {
  const t = await currentTenantId();
  return (await readJsonT<string[]>(t, "_hidden.json", "_hidden.json")) ?? [];
}

export async function unhideBuilding(id: string): Promise<void> {
  const t = await currentTenantId();
  await writeHidden(t, (await listHiddenBuildings()).filter((x) => x !== id));
}

export async function hideBuilding(id: string): Promise<void> {
  const t = await currentTenantId();
  const l = await listHiddenBuildings();
  if (!l.includes(id)) {
    l.push(id);
    await writeHidden(t, l);
  }
}

/** Delete a building: remove custom record or hide built-in, then drop its plan + image. */
export async function deleteBuilding(id: string): Promise<void> {
  const custom = await listCustomBuildings();
  if (custom.some((b) => b.id === id)) await removeCustomBuilding(id);
  else await hideBuilding(id);
  await deletePlan(id);
  await deletePlanImage(id);
}

// Role assignments moved to the User table (Postgres) — see lib/server/users.ts.
