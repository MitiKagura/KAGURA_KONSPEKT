import { NextResponse } from "next/server";
import { db } from "@/db";
import { homework } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json()) as { done?: boolean; task?: string };
  const patch: Record<string, unknown> = {};
  if (body.done !== undefined) patch.done = body.done;
  if (body.task !== undefined) patch.task = body.task;
  const [hw] = await db
    .update(homework)
    .set(patch)
    .where(and(eq(homework.id, Number(id)), eq(homework.userId, me.id)))
    .returning();
  if (!hw) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ homework: hw });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await db
    .delete(homework)
    .where(and(eq(homework.id, Number(id)), eq(homework.userId, me.id)));
  return NextResponse.json({ ok: true });
}
