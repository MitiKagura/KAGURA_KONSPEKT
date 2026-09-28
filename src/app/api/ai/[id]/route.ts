import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiJobs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const [job] = await db
    .select()
    .from(aiJobs)
    .where(and(eq(aiJobs.id, Number(id)), eq(aiJobs.userId, me.id)));
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await db
    .delete(aiJobs)
    .where(and(eq(aiJobs.id, Number(id)), eq(aiJobs.userId, me.id)));
  return NextResponse.json({ ok: true });
}
