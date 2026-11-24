import { describe, it, expect, beforeEach, vi } from "vitest";
import * as schema from "~/db/schema";
import { LessonProgressStatus } from "~/db/schema";
import type { TestDb } from "~/test/setup";
import { markdown } from "~/lib/text";
import { getLessonPage } from "../index.server";
import {
  completeLesson,
  findComment,
  findQuiz,
  scoreQuiz,
} from "../lesson-actions.server";
import {
  decisionsFor,
  freshDb,
  seedCourse,
  seedQuiz,
  type DbHolder,
} from "./fixtures";

const holder = vi.hoisted((): DbHolder => ({ current: null }));
vi.mock("~/db", async () => {
  const { dbProxy } = await import("./fixtures");
  return { db: dbProxy(holder) };
});

let database: TestDb;
let seeded: ReturnType<typeof seedCourse>;
let quiz: ReturnType<typeof seedQuiz>;

beforeEach(() => {
  database = freshDb(holder);
  seeded = seedCourse(database);
  quiz = seedQuiz(database, seeded.lessons[0].id);
});

describe("scoreQuiz", () => {
  it("passes with an A when every answer is right, and records the answers", () => {
    const [first, second] = quiz.questions;
    const result = scoreQuiz(seeded.user.id, quiz.quiz.id, {
      [first.id]: first.right,
      [second.id]: second.right,
    });
    expect(result).toMatchObject({
      score: 1,
      passed: true,
      grade: "A",
      totalCorrect: 2,
      totalQuestions: 2,
    });
    expect(database.select().from(schema.quizAnswers).all()).toHaveLength(2);
  });

  it("fails with an F when half is right, and marks the unanswered question", () => {
    const [first, second] = quiz.questions;
    const result = scoreQuiz(seeded.user.id, quiz.quiz.id, {
      [first.id]: first.right,
    });
    expect(result).toMatchObject({ score: 0.5, passed: false, grade: "F" });
    expect(result?.questionResults[1]).toEqual({
      questionId: second.id,
      correct: false,
      selectedOptionId: null,
      correctOptionId: null,
    });
    expect(result?.questionResults[0].correctOptionId).toBe(first.right);
  });

  it("counts a wrong option as wrong", () => {
    const [first, second] = quiz.questions;
    const result = scoreQuiz(seeded.user.id, quiz.quiz.id, {
      [first.id]: first.wrong,
      [second.id]: second.wrong,
    });
    expect(result).toMatchObject({ score: 0, totalCorrect: 0 });
  });

  it("gives null for a quiz that does not exist", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(scoreQuiz(seeded.user.id, 9999, {})).toBeNull();
  });

  it("shows the best attempt on the lesson page", async () => {
    const [first] = quiz.questions;
    scoreQuiz(seeded.user.id, quiz.quiz.id, { [first.id]: first.right });
    const page = await getLessonPage(
      decisionsFor(seeded),
      seeded.lessons[0].id
    );
    expect(page?.view === "full" && page.bestAttempt).toEqual({
      score: 0.5,
      passed: false,
    });
  });
});

describe("grading", () => {
  it.each([
    [10, "A", true],
    [9, "A", true],
    [8, "B", true],
    [7, "C", false],
    [6, "D", false],
    [5, "F", false],
  ])("%i of 10 right is a %s (passed: %s)", (right, grade, passed) => {
    const ten = seedQuiz(database, seeded.lessons[1].id, { count: 10 });
    const answers = Object.fromEntries(
      ten.questions.map((q, index) => [q.id, index < right ? q.right : q.wrong])
    );
    expect(scoreQuiz(seeded.user.id, ten.quiz.id, answers)).toMatchObject({
      grade,
      passed,
      totalCorrect: right,
    });
  });

  it("scores true/false questions", () => {
    const trueFalse = seedQuiz(database, seeded.lessons[1].id, {
      questionType: schema.QuestionType.TrueFalse,
    });
    const [first, second] = trueFalse.questions;
    const result = scoreQuiz(seeded.user.id, trueFalse.quiz.id, {
      [first.id]: first.right,
      [second.id]: second.wrong,
    });
    expect(result?.questionResults.map((r) => r.correctOptionId)).toEqual([
      first.right,
      second.right,
    ]);
    expect(result?.totalCorrect).toBe(1);
  });

  it("scores a quiz with no questions as zero, without failing", () => {
    const empty = seedQuiz(database, seeded.lessons[1].id, { count: 0 });
    expect(scoreQuiz(seeded.user.id, empty.quiz.id, {})).toMatchObject({
      score: 0,
      totalQuestions: 0,
    });
  });
});

describe("findComment", () => {
  it("finds a comment by id, with the lesson it is on", () => {
    const comment = database
      .insert(schema.comments)
      .values({
        lessonId: seeded.lessons[2].id,
        userId: seeded.user.id,
        body: markdown("Hi"),
      })
      .returning()
      .get();
    expect(findComment(comment.id)?.lessonId).toBe(seeded.lessons[2].id);
    expect(findComment(9999)).toBeUndefined();
  });
});

describe("findQuiz", () => {
  it("finds a quiz by id, with the lesson it belongs to", () => {
    expect(findQuiz(quiz.quiz.id)?.lessonId).toBe(seeded.lessons[0].id);
    expect(findQuiz(9999)).toBeUndefined();
  });
});

describe("completeLesson", () => {
  it("completes a lesson the Student has not opened", () => {
    const now = new Date("2026-03-01T12:00:00.000Z");
    const progress = completeLesson(seeded.user.id, seeded.lessons[2].id, now);
    expect(progress.status).toBe(LessonProgressStatus.Completed);
    expect(progress.completedAt).toBe(now.toISOString());
  });

  it("completes a lesson already in progress, and viewing keeps it complete", async () => {
    const lessonId = seeded.lessons[0].id;
    await getLessonPage(decisionsFor(seeded), lessonId);
    completeLesson(seeded.user.id, lessonId, new Date());
    const page = await getLessonPage(decisionsFor(seeded), lessonId);
    expect(page?.view === "full" && page.lessonStatus).toBe(
      LessonProgressStatus.Completed
    );
    expect(database.select().from(schema.lessonProgress).all()).toHaveLength(1);
  });
});
