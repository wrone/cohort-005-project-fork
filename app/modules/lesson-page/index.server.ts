import { loadLessonPage, type FoundDecisions } from "./lib/load";

export type { FoundDecisions };

/**
 * Everything the lesson page shows, for someone the permissions module has
 * already found the course for. Someone who cannot view the content gets the
 * "locked" shape: the outline and the reason, never the body, video or quiz.
 * Gives `null` when the lesson or its module does not exist.
 *
 * Viewing a lesson as someone who can take the course marks it in progress.
 */
export function getLessonPage(decisions: FoundDecisions, lessonId: number) {
  return loadLessonPage(decisions, lessonId);
}

export type LessonPage = NonNullable<Awaited<ReturnType<typeof getLessonPage>>>;
export type LockedLessonPage = Extract<LessonPage, { view: "locked" }>;
export type FullLessonPage = Extract<LessonPage, { view: "full" }>;
