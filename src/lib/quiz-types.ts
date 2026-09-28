/**
 * Общие типы теста. Вынесены отдельно от src/lib/ollama.ts,
 * потому что тот модуль серверный (server-only) и не может
 * импортироваться клиентскими компонентами.
 */
export interface QuizQuestion {
  question: string;
  /** Ровно четыре варианта: один верный и три правдоподобных неверных. */
  options: string[];
  /** Индекс правильного варианта: 0–3. */
  correct: number;
  explanation: string;
}

export interface QuizPayload {
  title: string;
  questions: QuizQuestion[];
}

/** Мягкая проверка структуры перед отрисовкой теста в интерфейсе. */
export function isQuizPayload(value: unknown): value is QuizPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { title?: unknown; questions?: unknown };
  if (typeof candidate.title !== "string") return false;
  if (!Array.isArray(candidate.questions) || candidate.questions.length === 0) {
    return false;
  }
  return candidate.questions.every((item) => {
    if (!item || typeof item !== "object") return false;
    const question = item as Record<string, unknown>;
    return (
      typeof question.question === "string" &&
      Array.isArray(question.options) &&
      question.options.length === 4 &&
      question.options.every((option) => typeof option === "string") &&
      Number.isInteger(question.correct) &&
      (question.correct as number) >= 0 &&
      (question.correct as number) <= 3
    );
  });
}
