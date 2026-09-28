import { NextResponse } from "next/server";
import { db } from "@/db";
import { subjects } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json()) as { name?: string };
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Пустое название" }, { status: 400 });
  const [s] = await db
    .update(subjects)
    .set({ name })
    .where(and(eq(subjects.id, Number(id)), eq(subjects.userId, me.id)))
    .returning();
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ subject: s });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  // Конспекты предмета удаляются каскадом (onDelete: cascade)
  await db
    .delete(subjects)
    .where(and(eq(subjects.id, Number(id)), eq(subjects.userId, me.id)));
  return NextResponse.json({ ok: true });
}
