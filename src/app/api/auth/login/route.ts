import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  createSession,
  ensureSeed,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureSeed();
    const body = (await req.json()) as { username?: string; password?: string };
    const username = (body.username || "").trim();
    const password = body.password || "";
    if (!username || !password) {
      return NextResponse.json({ error: "Введите логин и пароль" }, { status: 400 });
    }
    const [u] = await db.select().from(users).where(eq(users.username, username));
    if (!u || !(await verifyPassword(password, u.passwordHash))) {
      return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
    }
    await createSession({ id: u.id, username: u.username, role: u.role });
    return NextResponse.json({
      user: { id: u.id, username: u.username, role: u.role },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка входа" },
      { status: 500 },
    );
  }
}
