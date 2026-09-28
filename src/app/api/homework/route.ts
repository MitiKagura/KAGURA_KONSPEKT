import { NextResponse } from "next/server";
import { db } from "@/db";
import { homework } from "@/db/schema";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const conds = [eq(homework.userId, me.id)];
  if (from) conds.push(gte(homework.day, from));
  if (to) conds.push(lte(homework.day, to));
  const list = await db
    .select()
    .from(homework)
    .where(and(...conds))
    .orderBy(asc(homework.day), asc(homework.id));
  return NextResponse.json({ homework: list });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    subject?: string;
    day?: string;
    task?: string;
  };
  const subject = (body.subject || "").trim();
  const task = (body.task || "").trim();
  const day = (body.day || "").trim();
  if (!subject || !task || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json(
      { error: "Укажите предмет, дату и текст задания" },
      { status: 400 },
    );
  }
  const [hw] = await db
    .insert(homework)
    .values({ userId: me.id, subject, task, day })
    .returning();
  return NextResponse.json({ homework: hw });
}
