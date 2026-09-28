import { NextResponse } from "next/server";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json()) as {
    title?: string;
    content?: string;
    subjectId?: number;
  };
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) patch.title = body.title.trim() || "Без названия";
  if (body.content !== undefined) patch.content = body.content;
  if (body.subjectId !== undefined) patch.subjectId = Number(body.subjectId);
  const [n] = await db
    .update(notes)
    .set(patch)
    .where(and(eq(notes.id, Number(id)), eq(notes.userId, me.id)))
    .returning();
  if (!n) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ note: n });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await db
    .delete(notes)
    .where(and(eq(notes.id, Number(id)), eq(notes.userId, me.id)));
  return NextResponse.json({ ok: true });
}
