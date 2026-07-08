import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { findAvailability } from "./availability";
import { listBookings } from "./db";
import { getDirectoryMap } from "./directory";
import { getHiddenPresenceEmails } from "./users";
import { overlaps, ACTIVE_STATUSES, todayInTz } from "../booking-rules";
import type { AppUser } from "./auth";

// AI booking concierge. A Claude tool-use loop where every tool runs server-side as the current
// user — reads are tenant/permission-scoped, and BOOKING IS NEVER EXECUTED HERE: the assistant can
// only *propose* a booking, which the client confirms through the fully-validated /api/bookings
// route. So the AI can't bypass licence limits, locks, quotas, or on-behalf rules.

const MODEL = process.env.ASSISTANT_MODEL || "claude-opus-4-8";
export const assistantConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

export interface BookingProposal {
  buildingId: string;
  spaceKey: string;
  spaceLabel: string;
  kind: string;
  date: string;
  durationType: "full" | "half" | "hourly";
  startTime?: string;
  endTime?: string;
}
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

function displayName(email: string): string {
  return (email.split("@")[0] || email).replace(/[._]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "find_availability",
    description:
      "Find spaces that are actually free on a date. Use this before proposing any booking. Optionally filter by kind or building, or rank by proximity to a colleague ('near_colleague').",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date in YYYY-MM-DD" },
        kind: { type: "string", enum: ["desk", "office", "room", "parking"], description: "Type of space" },
        building: { type: "string", description: "Building name or id to restrict to (optional)" },
        near_colleague: { type: "string", description: "A colleague's name or email to sit near (optional)" },
      },
      required: ["date"],
    },
  },
  {
    name: "whos_in",
    description: "List who from the workspace is booked or checked in on a date (respecting privacy opt-outs).",
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD" }, building: { type: "string" } },
      required: ["date"],
    },
  },
  {
    name: "list_my_bookings",
    description: "List the current user's own active (upcoming or in-progress) bookings.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "propose_booking",
    description:
      "Propose ONE specific booking for the user to confirm. Do not claim it is booked — the user must confirm. Only propose a space returned by find_availability.",
    input_schema: {
      type: "object",
      properties: {
        building_id: { type: "string" },
        space_key: { type: "string" },
        space_label: { type: "string" },
        kind: { type: "string", enum: ["desk", "office", "room", "parking"] },
        date: { type: "string", description: "YYYY-MM-DD" },
        duration: { type: "string", enum: ["full", "half", "hourly"], description: "full day, half day, or hourly" },
        start_time: { type: "string", description: "HH:mm, required for hourly" },
        end_time: { type: "string", description: "HH:mm, required for hourly" },
      },
      required: ["building_id", "space_key", "space_label", "kind", "date", "duration"],
    },
  },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
async function runTool(name: string, input: any, user: AppUser, setProposal: (p: BookingProposal) => void): Promise<unknown> {
  if (name === "find_availability") {
    let nearEmail: string | undefined;
    const near = (input.near_colleague as string | undefined)?.trim();
    if (near) {
      if (near.includes("@")) nearEmail = near.toLowerCase();
      else {
        const dir = await getDirectoryMap();
        const hit = Object.values(dir).find((d) => (d.displayName || "").toLowerCase().includes(near.toLowerCase()));
        nearEmail = hit?.email;
      }
    }
    const spaces = await findAvailability({ date: input.date, kind: input.kind, buildingQuery: input.building, nearEmail }, user);
    return { count: spaces.length, spaces };
  }

  if (name === "whos_in") {
    const date = String(input.date);
    const [y, m, d] = date.split("-").map(Number);
    const lower = new Date(Date.UTC(y, m - 1, d) - 14 * 86400000).toISOString().slice(0, 10);
    const hidden = await getHiddenPresenceEmails();
    const rows = (await listBookings({ from: lower, to: date })).filter(
      (b) => ACTIVE_STATUSES.includes(b.status) && overlaps(b.start, b.end, `${date}T00:00`, `${date}T23:59`),
    );
    const dir = await getDirectoryMap(rows.map((b) => b.userEmail));
    const people = rows
      .filter((b) => b.userEmail.toLowerCase() === user.email.toLowerCase() || !hidden.has(b.userEmail.toLowerCase()))
      .filter((b) => !input.building || b.buildingId.split("__")[0].toLowerCase().includes(String(input.building).toLowerCase()))
      .map((b) => ({ name: dir[b.userEmail.toLowerCase()]?.displayName || displayName(b.userEmail), space: b.spaceLabel, checkedIn: b.status === "Checked in" }));
    return { date, count: people.length, people };
  }

  if (name === "list_my_bookings") {
    const now = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const mine = (await listBookings({ userEmail: user.email })).filter((b) => ACTIVE_STATUSES.includes(b.status) && b.end >= now);
    return { count: mine.length, bookings: mine.map((b) => ({ space: b.spaceLabel, kind: b.kind, start: b.start, end: b.end, status: b.status })) };
  }

  if (name === "propose_booking") {
    setProposal({
      buildingId: input.building_id,
      spaceKey: input.space_key,
      spaceLabel: input.space_label,
      kind: input.kind,
      date: input.date,
      durationType: input.duration,
      startTime: input.start_time,
      endTime: input.end_time,
    });
    return { ok: true, note: "Proposed to the user — awaiting their confirmation. Do not say it is booked." };
  }

  return { error: `unknown tool ${name}` };
}

export async function runAssistant(history: ChatTurn[], user: AppUser): Promise<{ reply: string; proposal?: BookingProposal }> {
  if (!assistantConfigured) return { reply: "The assistant isn't configured yet. Ask your administrator to set ANTHROPIC_API_KEY." };

  const client = new Anthropic();
  const today = todayInTz(); // server-local; fine for a demo concierge
  const system =
    `You are RoamHub360's workspace-booking concierge, helping ${user.name} (${user.email}). Today is ${today}. ` +
    `You can find free desks/offices/meeting rooms/parking, show who's in, list the user's bookings, and PROPOSE a booking for them to confirm. ` +
    `Always call find_availability to get real options before proposing — never invent a space. When the user wants to book, propose exactly ONE space with propose_booking and tell them to confirm; never say a booking is done. ` +
    `Be warm, brief, and concrete. Dates are YYYY-MM-DD. If the user is vague ("tomorrow", "next Tuesday"), resolve it relative to today.`;

  const messages: Anthropic.MessageParam[] = history.slice(-12).map((t) => ({ role: t.role, content: t.content }));
  let proposal: BookingProposal | undefined;

  for (let step = 0; step < 6; step++) {
    const resp = await client.messages.create({ model: MODEL, max_tokens: 1500, system, tools: TOOLS, messages });
    if (resp.stop_reason !== "tool_use") {
      const reply = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").trim();
      return { reply: reply || "Done.", proposal };
    }
    messages.push({ role: "assistant", content: resp.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      let result: unknown;
      try {
        result = await runTool(block.name, block.input, user, (p) => (proposal = p));
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      }
      results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "Sorry — I couldn't work that out. Could you rephrase?", proposal };
}
