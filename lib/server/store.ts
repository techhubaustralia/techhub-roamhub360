import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import type { FloorPlan } from "@/lib/types";

// Plans + custom-building index persistence.
// Prod: Azure Blob Storage (AZURE_STORAGE_CONNECTION_STRING). Dev: local JSON files.
// Relational data (bookings/locks) lives in Azure SQL — see prisma/schema.prisma.

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

// ---------- File backend (dev fallback) ----------
const DATA_DIR = path.join(process.cwd(), "data");
const planFile = (id: string) => path.join(DATA_DIR, `plan-${id}.json`);
const BUILDINGS_FILE = path.join(DATA_DIR, "buildings.json");
async function readFileJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}
async function writeFileJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

// ---------- Public API (backend-agnostic) ----------
export async function getStoredPlan(id: string): Promise<FloorPlan | null> {
  return useBlob ? blobJson<FloorPlan>(`${id}.json`) : readFileJson<FloorPlan>(planFile(id));
}
export async function putPlan(plan: FloorPlan): Promise<void> {
  if (useBlob) await putBlobJson(`${plan.id}.json`, plan);
  else await writeFileJson(planFile(plan.id), plan);
}
export async function deletePlan(id: string): Promise<void> {
  if (useBlob) {
    const c = await container();
    await c.getBlockBlobClient(`${id}.json`).deleteIfExists();
  } else {
    await fs.rm(planFile(id), { force: true });
  }
}
export async function listCustomBuildings(): Promise<CustomBuilding[]> {
  const data = useBlob
    ? await blobJson<CustomBuilding[]>("_buildings.json")
    : await readFileJson<CustomBuilding[]>(BUILDINGS_FILE);
  return data ?? [];
}
export async function addCustomBuilding(b: CustomBuilding): Promise<void> {
  const list = (await listCustomBuildings()).filter((x) => x.id !== b.id);
  list.push(b);
  if (useBlob) await putBlobJson("_buildings.json", list);
  else await writeFileJson(BUILDINGS_FILE, list);
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
  const list = await listCustomBuildings();
  const i = list.findIndex((b) => b.id === buildingId);
  if (i < 0) return;
  const norm = floors.length && !floors.some((f) => f.isDefault) ? floors.map((f, j) => ({ ...f, isDefault: j === 0 })) : floors;
  list[i] = { ...list[i], floors: norm };
  if (useBlob) await putBlobJson("_buildings.json", list);
  else await writeFileJson(BUILDINGS_FILE, list);
}

/** Keep a custom building's name/region/country in step with its saved plan,
 *  so the location picker groups it under the right region (not "Custom sites"). */
export async function syncCustomBuildingMeta(plan: { id: string; name?: string; region?: string; country?: string }): Promise<void> {
  const list = await listCustomBuildings();
  const i = list.findIndex((b) => b.id === plan.id);
  if (i < 0) return; // built-in; region/country come from static data
  list[i] = { ...list[i], name: plan.name || list[i].name, region: plan.region, country: plan.country };
  if (useBlob) await putBlobJson("_buildings.json", list);
  else await writeFileJson(BUILDINGS_FILE, list);
}

// ---------- floor-plan background images (binary) ----------
const imgName = (id: string) => `img-${id}`;
const imgFile = (id: string) => path.join(DATA_DIR, `img-${id}.bin`);
const imgTypeFile = (id: string) => path.join(DATA_DIR, `img-${id}.type`);

export async function putPlanImage(id: string, buf: Buffer, contentType: string): Promise<void> {
  if (useBlob) {
    const c = await container();
    await c.getBlockBlobClient(imgName(id)).uploadData(buf, { blobHTTPHeaders: { blobContentType: contentType } });
  } else {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(imgFile(id), buf);
    await fs.writeFile(imgTypeFile(id), contentType, "utf8");
  }
}

export async function deletePlanImage(id: string): Promise<void> {
  if (useBlob) {
    const c = await container();
    await c.getBlockBlobClient(imgName(id)).deleteIfExists();
  } else {
    await fs.rm(imgFile(id), { force: true });
    await fs.rm(imgTypeFile(id), { force: true });
  }
}

// ---------- building removal (custom = remove, built-in = hide) ----------
const HIDDEN_FILE = path.join(DATA_DIR, "_hidden.json");

export async function removeCustomBuilding(id: string): Promise<void> {
  const list = (await listCustomBuildings()).filter((x) => x.id !== id);
  if (useBlob) await putBlobJson("_buildings.json", list);
  else await writeFileJson(BUILDINGS_FILE, list);
}

export async function listHiddenBuildings(): Promise<string[]> {
  const d = useBlob ? await blobJson<string[]>("_hidden.json") : await readFileJson<string[]>(HIDDEN_FILE);
  return d ?? [];
}

export async function unhideBuilding(id: string): Promise<void> {
  const l = (await listHiddenBuildings()).filter((x) => x !== id);
  if (useBlob) await putBlobJson("_hidden.json", l);
  else await writeFileJson(HIDDEN_FILE, l);
}

export async function hideBuilding(id: string): Promise<void> {
  const l = await listHiddenBuildings();
  if (!l.includes(id)) {
    l.push(id);
    if (useBlob) await putBlobJson("_hidden.json", l);
    else await writeFileJson(HIDDEN_FILE, l);
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

export async function getPlanImage(id: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (useBlob) {
    const c = await container();
    const b = c.getBlockBlobClient(imgName(id));
    if (!(await b.exists())) return null;
    const buffer = await b.downloadToBuffer();
    const props = await b.getProperties();
    return { buffer, contentType: props.contentType || "application/octet-stream" };
  }
  try {
    const buffer = await fs.readFile(imgFile(id));
    const contentType = await fs.readFile(imgTypeFile(id), "utf8").catch(() => "application/octet-stream");
    return { buffer, contentType };
  } catch {
    return null;
  }
}
