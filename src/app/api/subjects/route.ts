import { NextResponse } from "next/server";
import { db } from "@/db";
import { subjects } from "@/db/schema";
import { asc, eq, max } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await db
    .select()
    .from(subjects)
    .where(eq(subjects.userId, me.id))
    .orderBy(asc(subjects.sort), asc(subjects.id));
  return NextResponse.json({ subjects: list });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as { name?: string };
  const name = (body.name || "").trim();
  if (!name) {
    return NextResponse.json({ error: "Введите название предмета" }, { status: 400 });
  }
  const [m] = await db
    .select({ v: max(subjects.sort) })
    .from(subjects)
    .where(eq(subjects.userId, me.id));
  const [s] = await db
    .insert(subjects)
    .values({ userId: me.id, name, sort: (m?.v ?? -1) + 1 })
    .returning();
  return NextResponse.json({ subject: s });
}
