import { NextResponse } from "next/server";
import { db } from "@/db";
import { scheduleOverrides } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  await db
    .delete(scheduleOverrides)
    .where(
      and(
        eq(scheduleOverrides.id, Number(id)),
        eq(scheduleOverrides.userId, me.id),
      ),
    );
  return NextResponse.json({ ok: true });
}
