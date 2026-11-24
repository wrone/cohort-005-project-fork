export type NoteDraftStatus = {
  length: number;
  tooLong: boolean;
  empty: boolean;
  /** The draft differs from what is saved. */
  unsaved: boolean;
  canSave: boolean;
};

export function describeDraft(
  draft: string,
  savedBody: string | null,
  maxLength: number
): NoteDraftStatus {
  const length = draft.length;
  const tooLong = length > maxLength;
  const empty = draft.trim().length === 0;
  // The save action trims, so surrounding whitespace is never unsaved work.
  const unsaved = draft.trim() !== (savedBody ?? "").trim();
  return {
    length,
    tooLong,
    empty,
    unsaved,
    canSave: unsaved && !empty && !tooLong,
  };
}
