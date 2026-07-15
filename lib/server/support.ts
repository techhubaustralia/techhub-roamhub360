import "server-only";

// Support-request data access. A request is created from the Help panel, emailed to OPS_EMAIL, and
// kept here so admins get an in-app open/closed queue. Attachments live in lib/server/store.ts; only
// their metadata + storage key are recorded on the row.
/* eslint-disable @typescript-eslint/no-explicit-any */

const useSql = Boolean(process.env.DATABASE_URL);

let _prisma: any = null;
async function prisma(): Promise<any> {
  if (!_prisma) {
    const mod: any = await import("@prisma/client");
    _prisma = new mod.PrismaClient();
  }
  return _prisma;
}

export interface SupportRequest {
  id: string;
  tenantId: string;
  userEmail: string;
  userName: string | null;
  category: string;
  subject: string;
  message: string;
  status: string; // open | closed
  priority: string; // low | normal | high
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentKey: string | null;
  attachmentSize: number | null;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

function toRow(r: any): SupportRequest {
  return {
    id: r.id,
    tenantId: r.tenantId,
    userEmail: r.userEmail,
    userName: r.userName ?? null,
    category: r.category,
    subject: r.subject,
    message: r.message,
    status: r.status,
    priority: r.priority,
    attachmentName: r.attachmentName ?? null,
    attachmentType: r.attachmentType ?? null,
    attachmentKey: r.attachmentKey ?? null,
    attachmentSize: r.attachmentSize ?? null,
    adminNote: r.adminNote ?? null,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

export interface NewSupportRequest {
  tenantId: string;
  userEmail: string;
  userName?: string | null;
  category: string;
  subject: string;
  message: string;
  attachmentName?: string | null;
  attachmentType?: string | null;
  attachmentKey?: string | null;
  attachmentSize?: number | null;
}

export async function createSupportRequest(input: NewSupportRequest): Promise<SupportRequest> {
  const p = await prisma();
  const row = await p.supportRequest.create({
    data: {
      tenantId: input.tenantId,
      userEmail: input.userEmail,
      userName: input.userName ?? null,
      category: input.category,
      subject: input.subject,
      message: input.message,
      attachmentName: input.attachmentName ?? null,
      attachmentType: input.attachmentType ?? null,
      attachmentKey: input.attachmentKey ?? null,
      attachmentSize: input.attachmentSize ?? null,
    },
  });
  return toRow(row);
}

export async function listSupportRequests(tenantId: string, status?: "open" | "closed"): Promise<SupportRequest[]> {
  if (!useSql) return [];
  const p = await prisma();
  const rows = await p.supportRequest.findMany({
    where: { tenantId, ...(status ? { status } : {}) },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 500,
  });
  return rows.map(toRow);
}

export async function getSupportRequest(id: string): Promise<SupportRequest | null> {
  if (!useSql) return null;
  const p = await prisma();
  const row = await p.supportRequest.findUnique({ where: { id } });
  return row ? toRow(row) : null;
}

export async function updateSupportRequest(id: string, patch: { status?: string; adminNote?: string | null; priority?: string }): Promise<SupportRequest> {
  const p = await prisma();
  const data: Record<string, unknown> = {};
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.adminNote !== undefined) data.adminNote = patch.adminNote?.trim() || null;
  if (patch.priority !== undefined) data.priority = patch.priority;
  const row = await p.supportRequest.update({ where: { id }, data });
  return toRow(row);
}

export async function openSupportCount(tenantId: string): Promise<number> {
  if (!useSql) return 0;
  const p = await prisma();
  return p.supportRequest.count({ where: { tenantId, status: "open" } }).catch(() => 0);
}
