import { describe, it, expect, beforeEach, vi } from "vitest";
import * as schema from "~/db/schema";
import { LessonProgressStatus } from "~/db/schema";
import type { TestDb } from "~/test/setup";
import { markdown } from "~/lib/text";
import { getLessonPage } from "../index.server";
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

beforeEach(() => {
  database = freshDb(holder);
  seeded = seedCourse(database);
});

async function fullPage(lessonIndex: number, overrides = {}) {
  const page = await getLessonPage(
    decisionsFor(seeded, overrides),
    seeded.lessons[lessonIndex].id
  );
  if (page?.view !== "full") throw new Error("expected the full lesson");
  return page;
}

describe("getLessonPage", () => {
  it("gives null for a lesson that does not exist", async () => {
    expect(await getLessonPage(decisionsFor(seeded), 9999)).toBeNull();
  });

  it("gives only the outline and the reason to someone who cannot view", async () => {
    const page = await getLessonPage(
      decisionsFor(seeded, {
        view: { allowed: false, reason: { kind: "not-enrolled" } },
        enrolled: false,
      }),
      seeded.lessons[1].id
    );
    expect(page).toEqual({
      view: "locked",
      course: {
        id: seeded.course.id,
        title: seeded.course.title,
        slug: seeded.course.slug,
      },
      curriculum: [
        {
          id: seeded.modules[0].id,
          title: "Basics",
          lessons: [
            { id: seeded.lessons[0].id, title: seeded.lessons[0].title },
            { id: seeded.lessons[1].id, title: seeded.lessons[1].title },
          ],
        },
        {
          id: seeded.modules[1].id,
          title: "Next steps",
          lessons: [
            { id: seeded.lessons[2].id, title: seeded.lessons[2].title },
          ],
        },
      ],
      module: { id: seeded.modules[0].id, title: "Basics" },
      lesson: { id: seeded.lessons[1].id, title: seeded.lessons[1].title },
      enrolled: false,
      lockedReason: { kind: "not-enrolled" },
    });
  });

  it("links the previous and next lesson across modules", async () => {
    const middle = await fullPage(1);
    expect(middle.prevLesson?.id).toBe(seeded.lessons[0].id);
    expect(middle.nextLesson?.id).toBe(seeded.lessons[2].id);
    expect(middle.nextLesson?.moduleTitle).toBe("Next steps");

    expect((await fullPage(0)).prevLesson).toBeNull();
    expect((await fullPage(2)).nextLesson).toBeNull();
  });

  it("renders the lesson Markdown to HTML", async () => {
    expect((await fullPage(1)).contentHtml).toContain("<h1");
    expect((await fullPage(0)).contentHtml).toBeNull();
  });

  it("marks the lesson in progress for someone who can take the course", async () => {
    const page = await fullPage(1);
    expect(page.lessonStatus).toBe(LessonProgressStatus.InProgress);
    expect(page.lessonProgressMap).toEqual({
      [seeded.lessons[1].id]: LessonProgressStatus.InProgress,
    });
  });

  it("records no progress for someone who can view but not take", async () => {
    const page = await fullPage(1, {
      take: { allowed: false, reason: { kind: "not-enrolled" } },
    });
    expect(page.lessonStatus).toBeNull();
    expect(page.lessonProgressMap).toEqual({});
    expect(database.select().from(schema.lessonProgress).all()).toEqual([]);
  });

  it("resumes the video where it was left and caps progress at 100%", async () => {
    const lessonId = seeded.lessons[1].id;
    for (const positionSeconds of [120, 300]) {
      database
        .insert(schema.videoWatchEvents)
        .values({
          userId: seeded.user.id,
          lessonId,
          eventType: "progress",
          positionSeconds,
          createdAt: new Date(2026, 0, 1, 0, positionSeconds).toISOString(),
        })
        .run();
    }
    const page = await fullPage(1);
    expect(page.lastWatchPosition).toBe(300);
    expect(page.watchProgress).toBe(50);
  });

  it("sends the quiz without saying which options are correct", async () => {
    seedQuiz(database, seeded.lessons[0].id);
    const page = await fullPage(0);
    expect(page.quiz?.questions).toHaveLength(2);
    expect(page.quiz?.questions[0].options[0]).toEqual({
      id: expect.any(Number),
      optionText: "Right",
    });
    expect(page.bestAttempt).toBeNull();
  });

  it("names the instructor and reports whether the viewer may moderate", async () => {
    const page = await fullPage(0, { manage: { allowed: true } });
    expect(page.instructorName).toBe("Test Instructor");
    expect(page.canModerate).toBe(true);
    expect(page.bookmarked).toBe(false);
    expect(page.note).toBeNull();
  });

  it("nests replies, flags the instructor, and drops a deleted question with no replies", async () => {
    const lessonId = seeded.lessons[0].id;
    const post = (
      userId: number,
      body: string,
      extra: Partial<typeof schema.comments.$inferInsert> = {}
    ) =>
      database
        .insert(schema.comments)
        .values({ lessonId, userId, body: markdown(body), ...extra })
        .returning()
        .get();
    const question = post(seeded.user.id, "**Why?**");
    post(seeded.instructor.id, "Because.", { parentId: question.id });
    post(seeded.user.id, "Retracted reply", {
      parentId: question.id,
      deletedAt: new Date().toISOString(),
    });
    post(seeded.user.id, "Never mind", {
      deletedAt: new Date().toISOString(),
    });

    const page = await fullPage(0);
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0].bodyHtml).toContain("<strong>Why?</strong>");
    expect(page.comments[0].author.isInstructor).toBe(false);
    expect(page.comments[0].replies).toHaveLength(1);
    expect(page.comments[0].replies[0].author.isInstructor).toBe(true);
    expect(page.comments[0].replies[0].author.isPlatformAdmin).toBe(false);
  });

  it("flags a Platform Admin's comment", async () => {
    const admin = database
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@example.com",
        role: schema.UserRole.Admin,
      })
      .returning()
      .get();
    database
      .insert(schema.comments)
      .values({
        lessonId: seeded.lessons[0].id,
        userId: admin.id,
        body: markdown("Hello"),
      })
      .run();
    const [comment] = (await fullPage(0)).comments;
    expect(comment.author.isPlatformAdmin).toBe(true);
  });
});
