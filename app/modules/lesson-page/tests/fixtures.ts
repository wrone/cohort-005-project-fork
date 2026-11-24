import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { markdown } from "~/lib/text";
import type { FoundDecisions } from "../index.server";

export const ALLOWED = { allowed: true } as const;

/**
 * The module reads the app database through `~/db`. Each test file mocks that
 * with `dbProxy(holder)`, and points the holder at a fresh database.
 */
export type DbHolder = { current: TestDb | null };

export function dbProxy(holder: DbHolder) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        const target = holder.current ?? createTestDb();
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }
  );
}

export function freshDb(holder: DbHolder): TestDb {
  holder.current = createTestDb();
  return holder.current;
}

export function seedCourse(database: TestDb) {
  const base = seedBaseData(database);
  const insertModule = (title: string, position: number) =>
    database
      .insert(schema.modules)
      .values({ courseId: base.course.id, title, position })
      .returning()
      .get();
  const first = insertModule("Basics", 1);
  const second = insertModule("Next steps", 2);
  const insertLesson = (
    moduleId: number,
    position: number,
    extra: Partial<typeof schema.lessons.$inferInsert> = {}
  ) =>
    database
      .insert(schema.lessons)
      .values({
        moduleId,
        title: `Lesson ${moduleId}.${position}`,
        position,
        ...extra,
      })
      .returning()
      .get();
  const lessons = [
    insertLesson(first.id, 1),
    insertLesson(first.id, 2, {
      content: markdown("# Hello"),
      videoUrl: "https://www.youtube.com/watch?v=abc",
      durationMinutes: 10,
    }),
    insertLesson(second.id, 1),
  ];
  return { ...base, modules: [first, second], lessons };
}

export function seedQuiz(
  database: TestDb,
  lessonId: number,
  { count = 2, questionType = schema.QuestionType.MultipleChoice } = {}
) {
  const quiz = database
    .insert(schema.quizzes)
    .values({ lessonId, title: "Check", passingScore: 0.7 })
    .returning()
    .get();
  const positions = Array.from({ length: count }, (_, index) => index + 1);
  const questions = positions.map((position) => {
    const question = database
      .insert(schema.quizQuestions)
      .values({
        quizId: quiz.id,
        questionText: `Question ${position}`,
        questionType,
        position,
      })
      .returning()
      .get();
    const [right, wrong] = [true, false].map(
      (isCorrect) =>
        database
          .insert(schema.quizOptions)
          .values({
            questionId: question.id,
            optionText: isCorrect ? "Right" : "Wrong",
            isCorrect,
          })
          .returning()
          .get().id
    );
    return { id: question.id, right, wrong };
  });
  return { quiz, questions };
}

export function decisionsFor(
  seeded: ReturnType<typeof seedCourse>,
  overrides: Partial<FoundDecisions> = {}
): FoundDecisions {
  return {
    found: true,
    course: seeded.course,
    person: { id: seeded.user.id, role: "student", country: null },
    enrolled: true,
    view: ALLOWED,
    take: ALLOWED,
    manage: {
      allowed: false,
      reason: { kind: "not-owning-instructor-or-platform-admin" },
    },
    ...overrides,
  };
}
