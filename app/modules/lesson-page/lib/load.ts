import { db } from "~/db";
import { isBookmarked } from "~/lib/bookmarks.server";
import { getNote } from "~/lib/notes.server";
import { renderMarkdown } from "~/lib/markdown.server";
import type {
  CourseDecisions,
  DenialReason,
} from "~/modules/permissions/course-permissions.server";
import {
  flattenCourseLessons,
  getCourseWithDetails,
  getLessonById,
  getModuleById,
  getUserById,
} from "./course";
import {
  calculateWatchProgress,
  getLastWatchPosition,
  getLessonProgress,
  getLessonProgressForCourse,
  markLessonInProgress,
} from "./progress";
import {
  getBestAttempt,
  getQuizByLessonId,
  getQuizWithQuestions,
} from "./quiz";
import { getLessonThread, renderThread } from "./thread";

export type FoundDecisions = Extract<CourseDecisions, { found: true }>;

type CourseWithDetails = NonNullable<ReturnType<typeof getCourseWithDetails>>;
type Lesson = NonNullable<ReturnType<typeof getLessonById>>;

export async function loadLessonPage(
  decisions: FoundDecisions,
  lessonId: number
) {
  const courseWithDetails = getCourseWithDetails(decisions.course.id);
  const lesson = getLessonById(lessonId);
  const mod = lesson ? getModuleById(lesson.moduleId) : undefined;
  if (!courseWithDetails || !lesson || !mod) return null;

  const outline = {
    course: {
      id: courseWithDetails.id,
      title: courseWithDetails.title,
      slug: courseWithDetails.slug,
    },
    curriculum: courseWithDetails.modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.map((l) => ({ id: l.id, title: l.title })),
    })),
    module: { id: mod.id, title: mod.title },
    enrolled: decisions.enrolled,
  };

  // Someone who can't view the content gets the lesson's title, its module and
  // the course outline — never the body, video or quiz — plus the reason, so
  // the page can show the right call to action.
  if (!decisions.view.allowed) {
    const lockedReason: DenialReason = decisions.view.reason;
    return {
      view: "locked" as const,
      ...outline,
      lesson: { id: lesson.id, title: lesson.title },
      lockedReason,
    };
  }

  return {
    view: "full" as const,
    ...outline,
    ...(await fullContent(decisions, courseWithDetails, lesson)),
  };
}

// Everything in here is behind the can-view-content bar: comments, Bookmarks
// and Notes are confidential to the course.
async function fullContent(
  decisions: FoundDecisions,
  courseWithDetails: CourseWithDetails,
  lesson: Lesson
) {
  const currentUserId = decisions.person?.id ?? null;
  const lessonId = lesson.id;
  const instructor = getUserById(decisions.course.instructorId);
  const note = currentUserId ? getNote(db, currentUserId, lessonId) : undefined;

  return {
    lesson,
    contentHtml: lesson.content ? await renderMarkdown(lesson.content) : null,
    currentUserId,
    ...neighbours(courseWithDetails, lessonId),
    ...quizFor(lessonId, currentUserId),
    ...progressFor(decisions, lesson),
    comments: await renderThread(getLessonThread(lessonId)),
    canModerate: decisions.manage.allowed,
    instructorName: instructor?.name ?? "your instructor",
    bookmarked: currentUserId
      ? isBookmarked(db, currentUserId, lessonId)
      : false,
    note: note ? { body: note.body, updatedAt: note.updatedAt } : null,
  };
}

/**
 * Progress is recorded only for people who can take the course, so a Student
 * under a Country Lock gets none. Viewing marks the lesson in progress.
 */
function progressFor(decisions: FoundDecisions, lesson: Lesson) {
  const currentUserId = decisions.person?.id;
  const lessonProgressMap: Record<number, string> = {};
  const none = {
    lessonStatus: null as string | null,
    lastWatchPosition: 0,
    watchProgress: 0,
    lessonProgressMap,
  };
  if (!currentUserId || !decisions.take.allowed) return none;

  markLessonInProgress(currentUserId, lesson.id);
  const progress = getLessonProgress(currentUserId, lesson.id);
  const records = getLessonProgressForCourse(
    currentUserId,
    decisions.course.id
  );
  for (const record of records) {
    lessonProgressMap[record.lessonId] = record.status;
  }

  const lessonStatus = progress?.status ?? null;
  if (!lesson.videoUrl) return { ...none, lessonStatus };

  const videoDurationSeconds = (lesson.durationMinutes ?? 0) * 60;
  return {
    lessonStatus,
    lastWatchPosition: getLastWatchPosition(currentUserId, lesson.id),
    watchProgress:
      videoDurationSeconds > 0
        ? calculateWatchProgress(currentUserId, lesson.id, videoDurationSeconds)
        : 0,
    lessonProgressMap,
  };
}

function neighbours(courseWithDetails: CourseWithDetails, lessonId: number) {
  const allLessons = flattenCourseLessons(courseWithDetails);
  const currentIndex = allLessons.findIndex((l) => l.id === lessonId);
  return {
    prevLesson: currentIndex > 0 ? allLessons[currentIndex - 1] : null,
    nextLesson:
      currentIndex < allLessons.length - 1
        ? allLessons[currentIndex + 1]
        : null,
  };
}

function quizFor(lessonId: number, currentUserId: number | null) {
  const quizRecord = getQuizByLessonId(lessonId);
  const quizData = quizRecord ? getQuizWithQuestions(quizRecord.id) : null;
  const best =
    quizRecord && currentUserId
      ? getBestAttempt(currentUserId, quizRecord.id)
      : undefined;

  return {
    // isCorrect is stripped so the answers never reach the client.
    quiz: quizData
      ? {
          id: quizData.id,
          title: quizData.title,
          passingScore: quizData.passingScore,
          questions: quizData.questions.map((q) => ({
            id: q.id,
            questionText: q.questionText,
            questionType: q.questionType,
            position: q.position,
            options: q.options.map((o) => ({
              id: o.id,
              optionText: o.optionText,
            })),
          })),
        }
      : null,
    bestAttempt: best ? { score: best.score, passed: best.passed } : null,
  };
}
