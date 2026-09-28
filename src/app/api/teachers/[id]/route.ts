import { NextResponse } from "next/server";
import { db } from "@/db";
import { teachers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = (await req.json()) as Record<string, string | undefined>;
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (body.subject !== undefined) {
    const subject = body.subject.trim();
    if (!subject) {
      return NextResponse.json({ error: "Предмет не может быть пустым" }, { status: 400 });
    }
    patch.subject = subject;
  }
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Имя преподавателя не может быть пустым" },
        { status: 400 },
      );
    }
    patch.name = name;
  }
  for (const field of ["room", "phone", "email", "messenger", "note"] as const) {
    if (body[field] !== undefined) patch[field] = (body[field] || "").trim();
  }

  const [row] = await db
    .update(teachers)
    .set(patch)
    .where(and(eq(teachers.id, Number(id)), eq(teachers.userId, me.id)))
    .returning();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ teacher: row });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await db
    .delete(teachers)
    .where(and(eq(teachers.id, Number(id)), eq(teachers.userId, me.id)));
  return NextResponse.json({ ok: true });
}
