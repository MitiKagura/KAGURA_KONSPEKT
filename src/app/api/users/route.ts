import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc } from "drizzle-orm";
import { getUser, hashPassword, seedDefaultSubjects } from "@/lib/auth";
import { ensureUserFolder, sanitizeName, FsError } from "@/lib/filesys";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const list = await db
    .select({
      id: users.id,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(asc(users.id));
  return NextResponse.json({ users: list });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const body = (await req.json()) as {
      username?: string;
      password?: string;
      role?: string;
    };
    const username = sanitizeName(body.username || "");
    const password = body.password || "";
    if (password.length < 4) {
      return NextResponse.json(
        { error: "Пароль должен быть не короче 4 символов" },
        { status: 400 },
      );
    }
    const role = body.role === "admin" ? "admin" : "user";
    const [u] = await db
      .insert(users)
      .values({ username, passwordHash: await hashPassword(password), role })
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
      });
    await seedDefaultSubjects(u.id);
    await ensureUserFolder(u.username);
    return NextResponse.json({ user: u });
  } catch (e) {
    if (e instanceof FsError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("unique")) {
      return NextResponse.json(
        { error: "Пользователь с таким именем уже существует" },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
