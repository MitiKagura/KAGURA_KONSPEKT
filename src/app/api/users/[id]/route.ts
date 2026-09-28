import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getUser, hashPassword, verifyPassword } from "@/lib/auth";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const uid = Number(id);
  if (uid === me.id) {
    return NextResponse.json(
      { error: "Нельзя удалить собственную учётную запись" },
      { status: 400 },
    );
  }
  await db.delete(users).where(eq(users.id, uid));
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const uid = Number(id);
  const isSelf = uid === me.id;
  if (!isSelf && me.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as {
    password?: string;
    currentPassword?: string;
  };
  const password = body.password || "";
  if (password.length < 4) {
    return NextResponse.json(
      { error: "Пароль должен быть не короче 4 символов" },
      { status: 400 },
    );
  }
  const [target] = await db.select().from(users).where(eq(users.id, uid));
  if (!target) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (isSelf) {
    const ok = await verifyPassword(
      body.currentPassword || "",
      target.passwordHash,
    );
    if (!ok) {
      return NextResponse.json(
        { error: "Текущий пароль введён неверно" },
        { status: 400 },
      );
    }
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(users.id, uid));
  return NextResponse.json({ ok: true });
}
