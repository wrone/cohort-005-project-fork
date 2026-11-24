import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { toast } from "sonner";
import { Lock, NotebookPen } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Textarea } from "~/components/ui/textarea";
import { cn, formatRelativeTime } from "~/lib/utils";
import { MAX_NOTE_LENGTH } from "~/lib/notes";
import { noteDraftStatus } from "~/modules/lesson-notes";

export type LessonNoteData = { body: string; updatedAt: string } | null;

// Laid out like the Questions & Discussion card (CommentThread), so the two
// places a Student writes on a lesson look like one family.
export function LessonNote({ note }: { note: LessonNoteData }) {
  const fetcher = useFetcher<{ ok: boolean; error?: string }>();
  const [draft, setDraft] = useState(note?.body ?? "");
  const saving = fetcher.state !== "idle";
  const status = noteDraftStatus(draft, note?.body ?? null, MAX_NOTE_LENGTH);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.error) {
      toast.error(fetcher.data.error);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <Card className="mb-8">
      <CardContent className="p-6">
        <NoteHeader />

        <fetcher.Form method="post" className="space-y-2">
          <input type="hidden" name="intent" value="save-note" />
          <Textarea
            name="body"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Jot down what you want to remember from this lesson..."
            aria-label="Your notes"
            className="min-h-32 resize-y"
          />

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={saving || !status.canSave}
            >
              {saving ? "Saving..." : "Save note"}
            </Button>

            <NoteSaveState unsaved={status.unsaved} note={note} />

            <span
              className={cn(
                "ml-auto text-xs",
                status.tooLong ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {status.length} / {MAX_NOTE_LENGTH}
            </span>
          </div>
        </fetcher.Form>
      </CardContent>
    </Card>
  );
}

function NoteSaveState({
  unsaved,
  note,
}: {
  unsaved: boolean;
  note: LessonNoteData;
}) {
  if (unsaved) {
    return (
      <span className="text-xs text-muted-foreground">Unsaved changes</span>
    );
  }
  if (!note) return null;
  return (
    <span suppressHydrationWarning className="text-xs text-muted-foreground">
      Saved · edited {formatRelativeTime(note.updatedAt)}
    </span>
  );
}

function NoteHeader() {
  return (
    <div className="mb-4 flex items-center gap-2">
      <NotebookPen className="size-5 text-primary" />
      <h2 className="text-xl font-semibold">Your notes</h2>
      <span className="ml-auto flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <Lock className="size-3" />
        Private
      </span>
    </div>
  );
}
