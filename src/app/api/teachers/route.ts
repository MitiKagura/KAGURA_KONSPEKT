import { NextResponse } from "next/server";
import { db } from "@/db";
import { teachers } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await db
    .select()
    .from(teachers)
    .where(eq(teachers.userId, me.id))
    .orderBy(asc(teachers.subject), asc(teachers.id));
  return NextResponse.json({ teachers: list });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as Record<string, string | undefined>;
  const subject = (body.subject || "").trim();
  const name = (body.name || "").trim();
  if (!subject || !name) {
    return NextResponse.json(
      { error: "Укажите предмет и преподавателя" },
      { status: 400 },
    );
  }
  const [row] = await db
    .insert(teachers)
    .values({
      userId: me.id,
      subject,
      name,
      room: (body.room || "").trim(),
      phone: (body.phone || "").trim(),
      email: (body.email || "").trim(),
      messenger: (body.messenger || "").trim(),
      note: (body.note || "").trim(),
    })
    .returning();
  return NextResponse.json({ teacher: row });
}
