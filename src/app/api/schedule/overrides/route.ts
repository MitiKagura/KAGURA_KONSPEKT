import { NextResponse } from "next/server";
import { db } from "@/db";
import { scheduleOverrides } from "@/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const KINDS = ["cancel", "move", "add"];

export async function GET(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const conds = [eq(scheduleOverrides.userId, me.id)];
  if (from) conds.push(gte(scheduleOverrides.day, from));
  if (to) conds.push(lte(scheduleOverrides.day, to));
  const list = await db
    .select()
    .from(scheduleOverrides)
    .where(and(...conds))
    .orderBy(asc(scheduleOverrides.day), asc(scheduleOverrides.num));
  return NextResponse.json({ overrides: list });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    day?: string;
    kind?: string;
    pairId?: number | null;
    subject?: string;
    num?: number;
    timeFrom?: string;
    timeTo?: string;
    room?: string;
    note?: string;
  };
  const day = (body.day || "").trim();
  const kind = KINDS.includes(body.kind || "") ? body.kind! : "add";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "Укажите корректную дату" }, { status: 400 });
  }
  if ((kind === "cancel" || kind === "move") && !body.pairId) {
    return NextResponse.json(
      { error: "Выберите пару из расписания" },
      { status: 400 },
    );
  }
  if (kind !== "cancel" && !(body.subject || "").trim()) {
    return NextResponse.json({ error: "Укажите предмет" }, { status: 400 });
  }
  const [row] = await db
    .insert(scheduleOverrides)
    .values({
      userId: me.id,
      day,
      kind,
      pairId: body.pairId ? Number(body.pairId) : null,
      subject: (body.subject || "").trim(),
      num: Math.max(1, Number(body.num) || 1),
      timeFrom: (body.timeFrom || "").trim(),
      timeTo: (body.timeTo || "").trim(),
      room: (body.room || "").trim(),
      note: (body.note || "").trim(),
    })
    .returning();
  return NextResponse.json({ override: row });
}
