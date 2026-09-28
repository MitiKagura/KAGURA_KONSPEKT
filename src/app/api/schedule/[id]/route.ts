import { NextResponse } from "next/server";
import { db } from "@/db";
import { pairs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    num?: number;
    subject?: string;
    timeFrom?: string;
    timeTo?: string;
    weekType?: string;
  };
  const patch: Record<string, unknown> = {};
  if (body.num !== undefined) patch.num = Math.max(1, Number(body.num) || 1);
  if (body.subject !== undefined) patch.subject = body.subject.trim();
  if (body.timeFrom !== undefined) patch.timeFrom = body.timeFrom.trim();
  if (body.timeTo !== undefined) patch.timeTo = body.timeTo.trim();
  if (body.weekType !== undefined && ["all", "odd", "even"].includes(body.weekType)) {
    patch.weekType = body.weekType;
  }
  const [p] = await db
    .update(pairs)
    .set(patch)
    .where(and(eq(pairs.id, Number(id)), eq(pairs.userId, me.id)))
    .returning();
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ pair: p });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await db
    .delete(pairs)
    .where(and(eq(pairs.id, Number(id)), eq(pairs.userId, me.id)));
  return NextResponse.json({ ok: true });
}
