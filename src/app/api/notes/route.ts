import { NextResponse } from "next/server";
import { db } from "@/db";
import { notes } from "@/db/schema";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const subjectId = url.searchParams.get("subjectId");
  const q = (url.searchParams.get("q") || "").trim();
  const conds = [eq(notes.userId, me.id)];
  if (subjectId) conds.push(eq(notes.subjectId, Number(subjectId)));
  if (q) {
    conds.push(
      or(ilike(notes.title, `%${q}%`), ilike(notes.content, `%${q}%`))!,
    );
  }
  const list = await db
    .select()
    .from(notes)
    .where(and(...conds))
    .orderBy(desc(notes.updatedAt));
  return NextResponse.json({ notes: list });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    subjectId?: number;
    title?: string;
    content?: string;
  };
  if (!body.subjectId) {
    return NextResponse.json({ error: "Не указан предмет" }, { status: 400 });
  }
  const [n] = await db
    .insert(notes)
    .values({
      userId: me.id,
      subjectId: Number(body.subjectId),
      title: (body.title || "").trim() || "Без названия",
      content: body.content || "",
    })
    .returning();
  return NextResponse.json({ note: n });
}
