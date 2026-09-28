import { NextResponse } from "next/server";
import { db } from "@/db";
import { pairs } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await db
    .select()
    .from(pairs)
    .where(eq(pairs.userId, me.id))
    .orderBy(asc(pairs.dow), asc(pairs.num), asc(pairs.id));
  return NextResponse.json({ pairs: list });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    dow?: number;
    num?: number;
    subject?: string;
    timeFrom?: string;
    timeTo?: string;
    weekType?: string;
  };
  const dow = Number(body.dow);
  const subject = (body.subject || "").trim();
  if (!(dow >= 1 && dow <= 7) || !subject) {
    return NextResponse.json(
      { error: "Укажите день недели и предмет" },
      { status: 400 },
    );
  }
  const weekType = ["all", "odd", "even"].includes(body.weekType || "")
    ? body.weekType!
    : "all";
  const [p] = await db
    .insert(pairs)
    .values({
      userId: me.id,
      dow,
      num: Math.max(1, Number(body.num) || 1),
      subject,
      timeFrom: (body.timeFrom || "").trim(),
      timeTo: (body.timeTo || "").trim(),
      weekType,
    })
    .returning();
  return NextResponse.json({ pair: p });
}
