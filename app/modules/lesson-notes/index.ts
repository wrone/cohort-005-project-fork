import { describeDraft, type NoteDraftStatus } from "./lib/draft";

export type { NoteDraftStatus };

/**
 * What the note editor should show for the text in the box, given the note
 * as last saved (`null` when the Student has none yet). A note cannot be
 * saved blank: the save action rejects it, so the button stays disabled.
 */
export function noteDraftStatus(
  draft: string,
  savedBody: string | null,
  maxLength: number
): NoteDraftStatus {
  return describeDraft(draft, savedBody, maxLength);
}
