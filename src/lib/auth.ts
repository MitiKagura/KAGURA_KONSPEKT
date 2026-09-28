import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, subjects } from "@/db/schema";
import { ensureUserFolder } from "@/lib/filesys";

export const COOKIE_NAME = "kk_session";
export const DEFAULT_SUBJECTS = ["Математика", "Русский"];

function secret() {
  return new TextEncoder().encode(
    process.env.SESSION_SECRET || "kagura_konspekt_dev_secret",
  );
}

export interface SessionUser {
  id: number;
  username: string;
  role: string;
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(u: SessionUser) {
  const token = await new SignJWT({ un: u.username, role: u.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(u.id))
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  const c = await cookies();
  c.delete(COOKIE_NAME);
}

export async function getUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: Number(payload.sub),
      username: String(payload.un),
      role: String(payload.role),
    };
  } catch {
    return null;
  }
}

/** Создаёт дефолтные предметы для пользователя, если у него их ещё нет. */
export async function seedDefaultSubjects(userId: number) {
  const existing = await db
    .select({ id: subjects.id })
    .from(subjects)
    .where(eq(subjects.userId, userId));
  if (existing.length > 0) return;
  await db.insert(subjects).values(
    DEFAULT_SUBJECTS.map((name, i) => ({
      userId,
      name,
      sort: i,
      isDefault: true,
    })),
  );
}

/**
 * Первичный seed: если в БД нет пользователей, установщик должен передать
 * одноразовые учётные данные администратора через окружение.
 *
 * Значения хранятся в base64, чтобы логин/пароль не зависели от спецсимволов
 * в .env. После первичного входа установщик удаляет эти переменные из .env.
 */
export async function ensureSeed() {
  const all = await db.select({ id: users.id }).from(users).limit(1);
  if (all.length > 0) return;

  const encodedUsername = process.env.ADMIN_INITIAL_USERNAME_B64 || "";
  const encodedPassword = process.env.ADMIN_INITIAL_PASSWORD_B64 || "";
  if (!encodedUsername || !encodedPassword) {
    throw new Error(
      "База данных не содержит пользователей. Запустите install.sh и задайте учётные данные администратора.",
    );
  }

  const username = Buffer.from(encodedUsername, "base64").toString("utf8").trim();
  const password = Buffer.from(encodedPassword, "base64").toString("utf8");
  if (!username || password.length < 4) {
    throw new Error("Некорректные начальные учётные данные администратора.");
  }

  const [admin] = await db
    .insert(users)
    .values({
      username,
      passwordHash: await hashPassword(password),
      role: "admin",
    })
    .returning();
  await seedDefaultSubjects(admin.id);
  await ensureUserFolder(admin.username);
}
