import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/db";
import { notes, subjects } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { ensureUserFolder, filesRoot } from "@/lib/filesys";

export const dynamic = "force-dynamic";

function slug(s: string) {
  return (
    s
      .replace(/[/\\:*?"<>|]/g, "_")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Без названия"
  );
}

/**
 * Синхронизация конспектов с папкой пользователя:
 *  1) Экспорт: все конспекты выгружаются в <папка>/Конспекты/<Предмет>/<Название>.md
 *  2) Импорт: все *.md из этой папки, которых ещё нет в базе, добавляются как конспекты.
 */
export async function POST() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = me.id;
  try {
    await ensureUserFolder(me.username);
    const userDir = path.join(filesRoot(), me.username);
    const syncDir = path.join(userDir, "Конспекты");
    await fs.mkdir(syncDir, { recursive: true });

    const mySubjects = await db
      .select()
      .from(subjects)
      .where(eq(subjects.userId, me.id))
      .orderBy(asc(subjects.sort));
    const myNotes = await db
      .select()
      .from(notes)
      .where(eq(notes.userId, me.id));

    let exported = 0;
    const subjectById = new Map(mySubjects.map((s) => [s.id, s]));
    for (const n of myNotes) {
      const subj = subjectById.get(n.subjectId);
      if (!subj) continue;
      const dir = path.join(syncDir, slug(subj.name));
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, slug(n.title) + ".md"), n.content, "utf8");
      exported++;
    }

    let imported = 0;
    const existingTitles = new Set(
      myNotes.map((n) => `${n.subjectId}::${n.title.toLowerCase()}`),
    );
    async function walk(rel: string, dir: string, subjectName: string | null) {
      const items = await fs.readdir(dir, { withFileTypes: true });
      for (const it of items) {
        if (it.name.startsWith(".")) continue;
        const full = path.join(dir, it.name);
        if (it.isDirectory()) {
          await walk(rel ? `${rel}/${it.name}` : it.name, full, it.name);
        } else if (/\.(md|markdown|txt)$/i.test(it.name)) {
          const title = it.name.replace(/\.(md|markdown|txt)$/i, "");
          // Находим или создаём предмет по имени папки
          let subj = mySubjects.find(
            (s) => s.name.toLowerCase() === (subjectName || "").toLowerCase(),
          );
          if (!subj) {
            const name = subjectName || "Импортированные";
            subj =
              mySubjects.find((s) => s.name === name) ||
              (
                await db
                  .insert(subjects)
                  .values({ userId, name, sort: 900 })
                  .returning()
              )[0];
            mySubjects.push(subj);
          }
          const key = `${subj.id}::${title.toLowerCase()}`;
          if (existingTitles.has(key)) continue;
          const content = await fs.readFile(full, "utf8");
          await db.insert(notes).values({
            userId,
            subjectId: subj.id,
            title,
            content,
          });
          existingTitles.add(key);
          imported++;
        }
      }
    }
    await walk("", syncDir, null);

    return NextResponse.json({ ok: true, exported, imported });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка синхронизации" },
      { status: 500 },
    );
  }
}
