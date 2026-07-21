import "server-only";
import { prisma } from "./prisma";
import { currentTenantId } from "./tenant";
import { graphConfiguredFor, graphJson, graphPhotoDataUrl } from "./graph";
import { getDirectoryGroups } from "./tenant-integration";

// Team Build-Up B — Microsoft Entra directory sync. Pulls real profiles (name, title,
// department, manager, photo) from Graph /users into a per-tenant DirectoryUser cache, so
// "Who's in" (and later features) can show org-chart context instead of email-derived names.
//
// Degrades safely: with no DATABASE_URL (local dev) reads return empty and sync reports why;
// with no Graph config, sync reports that. Callers always fall back to email-derived names.
/* eslint-disable @typescript-eslint/no-explicit-any */

const useSql = Boolean(process.env.DATABASE_URL);


export interface DirectoryEntry {
  email: string;
  displayName?: string;
  jobTitle?: string;
  department?: string;
  officeLocation?: string;
  managerEmail?: string;
  photo?: string;
}

export interface SyncResult {
  ok: boolean;
  synced: number;
  photos: number;
  error?: string;
}

/** Best email for a Graph user object: mail, else userPrincipalName, lowercased. */
export function graphUserEmail(u: { mail?: string | null; userPrincipalName?: string | null } | null | undefined): string | null {
  const e = (u?.mail || u?.userPrincipalName || "").toLowerCase().trim();
  return e || null;
}

/** Graph's @odata.nextLink is an absolute URL; strip the base so graphJson can re-prepend it. */
export function stripGraphBase(next: string | undefined): string | null {
  if (!next) return null;
  return next.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, "");
}

const SELECT = "id,displayName,givenName,surname,mail,userPrincipalName,jobTitle,department,officeLocation,accountEnabled";

export interface EntraGroup {
  id: string;
  name: string;
  description?: string | null;
}

/** The customer's Entra groups, so an admin can choose which ones to sync instead of the whole
 *  directory. Needs the same User.Read.All/Group.Read.All app permission the sync already uses. */
export async function listEntraGroups(search?: string): Promise<{ ok: boolean; groups: EntraGroup[]; error?: string }> {
  const tenantId = await currentTenantId();
  if (!(await graphConfiguredFor(tenantId))) {
    return { ok: false, groups: [], error: "Microsoft isn't connected for this workspace yet." };
  }
  try {
    const q = search?.trim();
    // startswith() keeps it usable on big directories; without a search we just take the first page.
    const filter = q ? `&$filter=${encodeURIComponent(`startswith(displayName,'${q.replace(/'/g, "''")}')`)}` : "";
    const page = (await graphJson(`/groups?$select=id,displayName,description&$top=100${filter}`, tenantId)) as {
      value?: { id: string; displayName?: string; description?: string }[];
    };
    const groups = (page.value ?? [])
      .filter((g) => g.id && g.displayName)
      .map((g) => ({ id: g.id, name: g.displayName as string, description: g.description ?? null }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, groups };
  } catch (e) {
    return { ok: false, groups: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** Page through the Entra directory and upsert every enabled member for the current tenant.
 *  Photos are fetched per-user (best-effort) unless opts.photos === false. */
export async function syncDirectory(opts?: { photos?: boolean }): Promise<SyncResult> {
  if (!useSql) return { ok: false, synced: 0, photos: 0, error: "Directory sync requires a database (DATABASE_URL)." };
  const tenantId = await currentTenantId();
  if (!(await graphConfiguredFor(tenantId))) {
    return { ok: false, synced: 0, photos: 0, error: "Microsoft is not connected for this workspace. Configure it under Settings → Microsoft integration and grant User.Read.All." };
  }

  const p = await prisma();
  const wantPhotos = opts?.photos !== false;
  let synced = 0;
  let photos = 0;

  // SCOPE: when the workspace has chosen Entra groups, sync ONLY those groups' members (transitive,
  // so nested groups are included). Otherwise fall back to the whole directory. Syncing an entire
  // enterprise directory into a booking app is noisy and a privacy concern, so groups are preferred.
  const groups = await getDirectoryGroups(tenantId).catch(() => [] as string[]);
  const seen = new Set<string>(); // a person in two selected groups must only be counted once

  try {
    const startPaths = groups.length
      ? groups.map((g) => `/groups/${encodeURIComponent(g)}/transitiveMembers/microsoft.graph.user?$select=${SELECT}&$top=200`)
      : [`/users?$select=${SELECT}&$expand=manager($select=mail,userPrincipalName)&$top=200`];

    for (const start of startPaths) {
    let path: string | null = start;
    while (path) {
      const page = (await graphJson(path, tenantId)) as { value?: any[]; ["@odata.nextLink"]?: string };
      for (const u of page.value ?? []) {
        if (u.accountEnabled === false) continue; // skip disabled accounts
        if (u.id && seen.has(u.id)) continue;
        if (u.id) seen.add(u.id);
        const email = graphUserEmail(u);
        if (!email) continue;
        const managerEmail = graphUserEmail(u.manager);
        let photo: string | null = null;
        if (wantPhotos) {
          photo = await graphPhotoDataUrl(u.id || email, tenantId);
          if (photo) photos++;
        }
        const data = {
          displayName: u.displayName ?? null,
          givenName: u.givenName ?? null,
          surname: u.surname ?? null,
          jobTitle: u.jobTitle ?? null,
          department: u.department ?? null,
          officeLocation: u.officeLocation ?? null,
          managerEmail,
          photo,
          syncedAt: new Date(),
        };
        await p.directoryUser.upsert({
          where: { tenantId_email: { tenantId, email } },
          create: { tenantId, email, ...data },
          update: data,
        });
        synced++;
      }
      path = stripGraphBase(page["@odata.nextLink"]);
    }
    }
    return { ok: true, synced, photos };
  } catch (e) {
    return { ok: false, synced, photos, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Directory entries for the current tenant, keyed by lowercased email. Optionally restricted
 *  to a set of emails (e.g. just the people booked on a given day). Empty when no DB. */
export async function getDirectoryMap(emails?: string[]): Promise<Record<string, DirectoryEntry>> {
  if (!useSql) return {};
  const tenantId = await currentTenantId();
  const p = await prisma();
  const where: Record<string, unknown> = { tenantId };
  if (emails?.length) where.email = { in: [...new Set(emails.map((e) => e.toLowerCase()))] };
  const rows = await p.directoryUser.findMany({ where });
  const map: Record<string, DirectoryEntry> = {};
  for (const r of rows) {
    map[r.email] = {
      email: r.email,
      displayName: r.displayName ?? undefined,
      jobTitle: r.jobTitle ?? undefined,
      department: r.department ?? undefined,
      officeLocation: r.officeLocation ?? undefined,
      managerEmail: r.managerEmail ?? undefined,
      photo: r.photo ?? undefined,
    };
  }
  return map;
}

/** All directory entries for the current tenant (admin listing), newest sync first. */
export async function listDirectory(limit = 500): Promise<DirectoryEntry[]> {
  if (!useSql) return [];
  const tenantId = await currentTenantId();
  const p = await prisma();
  const rows = await p.directoryUser.findMany({ where: { tenantId }, orderBy: { displayName: "asc" }, take: limit });
  return rows.map((r: any) => ({
    email: r.email,
    displayName: r.displayName ?? undefined,
    jobTitle: r.jobTitle ?? undefined,
    department: r.department ?? undefined,
    officeLocation: r.officeLocation ?? undefined,
    managerEmail: r.managerEmail ?? undefined,
    photo: r.photo ?? undefined,
  }));
}

export interface DirectoryStatus {
  configured: boolean; // Graph creds present
  hasDb: boolean;
  count: number;
  lastSync: string | null;
}
export async function directoryStatus(): Promise<DirectoryStatus> {
  const tenantId = await currentTenantId();
  const configured = await graphConfiguredFor(tenantId);
  if (!useSql) return { configured, hasDb: false, count: 0, lastSync: null };
  const p = await prisma();
  const count = await p.directoryUser.count({ where: { tenantId } });
  const latest = count
    ? await p.directoryUser.findFirst({ where: { tenantId }, orderBy: { syncedAt: "desc" }, select: { syncedAt: true } })
    : null;
  return { configured, hasDb: true, count, lastSync: latest ? (latest.syncedAt as Date).toISOString() : null };
}
