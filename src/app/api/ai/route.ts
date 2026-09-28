import { NextResponse } from "next/server";
import { db } from "@/db";
import { aiJobs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { getUser } from "@/lib/auth";
import { AI_PROMPTS, startJob } from "@/lib/ollama";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await db
    .select()
    .from(aiJobs)
    .where(eq(aiJobs.userId, me.id))
    .orderBy(desc(aiJobs.id))
    .limit(30);
  return NextResponse.json({ jobs: list });
}

export async function POST(req: Request) {
  const me = await getUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json()) as {
    mode?: string;
    text?: string;
    customPrompt?: string;
    noteId?: number | null;
    title?: string;
  };
  const mode = body.mode && body.mode in AI_PROMPTS ? body.mode : "analyze";
  const text = (body.text || "").trim();
  const custom = (body.customPrompt || "").trim();
  if (mode === "custom" ? !custom : !text) {
    return NextResponse.json({ error: "Нет текста для запроса" }, { status: 400 });
  }
  // Не позволяем случайной строке </SOURCE> внутри заметки преждевременно
  // закрыть раздел исходных данных в инструкции модели.
  const safeSource = text.replace(/<\/?SOURCE>/gi, (tag) =>
    tag.replace("SOURCE", "SOURCE_TEXT"),
  );
  const sourceBlock = safeSource
    ? `\n\n<SOURCE>\n${safeSource}\n</SOURCE>`
    : "\n\n<SOURCE>\nИсходный конспект не предоставлен.\n</SOURCE>";
  const userRequest =
    mode === "custom"
      ? `\n\nПОЛЬЗОВАТЕЛЬСКИЙ ЗАПРОС:\n${custom}`
      : "";
  const finalInstruction =
    mode === "speech"
      ? "Выдай только готовый чистый текст без разметки, правил, примеров, комментариев и внутренних рассуждений."
      : "Выдай только готовый результат в Markdown, без описания процесса работы и без внутренних рассуждений.";
  const prompt = `${AI_PROMPTS[mode]}${userRequest}${sourceBlock}\n\n${finalInstruction}`;
  const title =
    (body.title || "").trim() ||
    (mode === "custom" ? custom.slice(0, 60) : text.split("\n")[0].slice(0, 60)) ||
    "Запрос";
  const [job] = await db
    .insert(aiJobs)
    .values({
      userId: me.id,
      noteId: body.noteId ? Number(body.noteId) : null,
      title,
      mode,
      prompt,
      status: "pending",
    })
    .returning({ id: aiJobs.id });
  // Фоновая обработка: ответ запишется в БД, клиент заберёт его опросом —
  // поэтому результат доступен с любого устройства, в т.ч. с телефона.
  startJob(job.id);
  return NextResponse.json({ id: job.id });
}
