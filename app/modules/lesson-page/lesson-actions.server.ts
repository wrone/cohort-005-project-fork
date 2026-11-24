import { getCommentById } from "./lib/thread";
import { markLessonComplete } from "./lib/progress";
import { computeResult, getQuizById } from "./lib/quiz";

/** A comment by id, deleted or not. The caller checks it is on its lesson. */
export function findComment(commentId: number) {
  return getCommentById(commentId);
}

/** A quiz by id. The caller checks it belongs to its lesson. */
export function findQuiz(quizId: number) {
  return getQuizById(quizId);
}

export function completeLesson(userId: number, lessonId: number) {
  return markLessonComplete(userId, lessonId);
}

/**
 * Scores the answers (question id to option id), records the attempt, and
 * gives the result, or `null` when the quiz is missing or scoring failed.
 */
export function scoreQuiz(
  userId: number,
  quizId: number,
  selectedAnswers: Record<number, number>
) {
  return computeResult(userId, quizId, selectedAnswers);
}
