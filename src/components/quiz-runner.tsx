"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { MarkdownView } from "@/components/markdown";
import type { QuizPayload } from "@/lib/quiz-types";

/**
 * Потоковое прохождение теста: по одному вопросу за раз.
 * Пользователь выбирает вариант, нажимает «Ответить» и сразу видит,
 * верно ли это, и разбор. Только потом открывается следующий вопрос.
 */
export default function QuizRunner({
  quiz,
  onRestart,
}: {
  quiz: QuizPayload;
  onRestart?: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const total = quiz.questions.length;
  const question = quiz.questions[index];
  const isLast = index === total - 1;
  const isRight = answered && selected === question.correct;

  const verdict = useMemo(() => {
    const ratio = total > 0 ? correctCount / total : 0;
    if (ratio === 1) return "отлично, тема усвоена полностью";
    if (ratio >= 0.7) return "хорошо, стоит повторить отдельные моменты";
    if (ratio >= 0.4) return "средне, перечитайте конспект";
    return "слабо, материал нужно разобрать заново";
  }, [correctCount, total]);

  function answer() {
    if (selected === null || answered) return;
    setAnswered(true);
    if (selected === question.correct) setCorrectCount((value) => value + 1);
  }

  function next() {
    if (isLast) {
      setFinished(true);
      return;
    }
    setIndex((value) => value + 1);
    setSelected(null);
    setAnswered(false);
  }

  function restart() {
    setIndex(0);
    setSelected(null);
    setAnswered(false);
    setCorrectCount(0);
    setFinished(false);
    onRestart?.();
  }

  if (finished) {
    return (
      <div className="panel p-6 text-center anim-in">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{
            background: "color-mix(in srgb, var(--accent) 16%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)",
          }}
        >
          <Check size={30} style={{ color: "var(--accent)" }} />
        </div>
        <h3 className="text-lg font-bold m-0 mb-1">Тест пройден</h3>
        <p className="text-sm muted mb-1">{quiz.title}</p>
        <p className="text-2xl font-extrabold m-0 mb-1" style={{ color: "var(--accent)" }}>
          {correctCount} из {total}
        </p>
        <p className="text-sm muted mb-5">{verdict}</p>
        <button className="btn btn-accent" onClick={restart}>
          <RotateCcw size={15} /> Пройти заново
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Прогресс прохождения */}
      <div className="panel p-4">
        <div className="row justify-between gap-3 flex-wrap mb-3">
          <span className="text-sm font-bold">{quiz.title}</span>
          <span className="chip chip-accent">
            Вопрос {index + 1} из {total} · верно: {correctCount}
          </span>
        </div>
        <div className="quiz-progress">
          <div
            className="quiz-progress-fill"
            style={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }}
          />
        </div>
      </div>

      <section className="panel p-5">
        <div className="quiz-text mb-4">
          <MarkdownView source={question.question} debounceMs={0} />
        </div>

        <div className="space-y-2">
          {question.options.map((option, optionIndex) => {
            const isChosen = selected === optionIndex;
            const showRight = answered && optionIndex === question.correct;
            const showWrong = answered && isChosen && optionIndex !== question.correct;
            return (
              <button
                key={optionIndex}
                type="button"
                className="quiz-option"
                data-state={
                  showRight
                    ? "right"
                    : showWrong
                      ? "wrong"
                      : isChosen
                        ? "selected"
                        : "idle"
                }
                disabled={answered}
                onClick={() => setSelected(optionIndex)}
              >
                <span className="quiz-marker">
                  {showRight ? (
                    <Check size={13} />
                  ) : showWrong ? (
                    <X size={13} />
                  ) : (
                    String.fromCharCode(1040 + optionIndex)
                  )}
                </span>
                <span className="quiz-option-body">
                  <MarkdownView source={option} debounceMs={0} />
                </span>
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="quiz-explanation anim-in">
            <div
              className="text-xs font-bold uppercase tracking-wider mb-1"
              style={{ color: isRight ? "var(--accent2)" : "#ff8fa3" }}
            >
              {isRight ? "Верно" : "Неверно"}
            </div>
            {question.explanation ? (
              <MarkdownView source={question.explanation} debounceMs={0} />
            ) : (
              <p className="text-sm muted m-0">
                Правильный вариант отмечен выше.
              </p>
            )}
          </div>
        )}

        <div className="row gap-2 mt-4 flex-wrap">
          {!answered ? (
            <button
              className="btn btn-accent"
              disabled={selected === null}
              onClick={answer}
            >
              <Check size={15} />
              {selected === null ? "Выберите вариант" : "Ответить"}
            </button>
          ) : (
            <button className="btn btn-accent" onClick={next}>
              {isLast ? "Показать результат" : "Следующий вопрос"}
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
