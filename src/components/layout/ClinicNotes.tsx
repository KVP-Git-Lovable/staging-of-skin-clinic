import { useMemo, useState } from "react";
import { ChevronDown, NotebookPen, Pencil, RotateCcw, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  cleanNoteBody,
  deletedNotes,
  liveNotes,
  noteBodyIsEmpty,
  noteMatchesSearch,
  noteSearchSummary,
  noteStamp,
  noteSummary,
  noteWasEdited,
  type ClinicNote,
} from "@/lib/clinicNotes";

/**
 * The clinic's shared notebook, beside the bell.
 *
 * It replaces the paper book on the front desk: one list everybody signed in
 * can see and add to, a date on every line, and a search box - which is the
 * part the book could never do.
 *
 * Deleting only sets deleted_at. clinic_notes has no delete policy at all, so
 * nothing here can destroy a note, and one taken out by mistake is a click
 * away from coming back.
 */

const COLUMNS =
  "id, body, created_at, created_by_name, updated_at, updated_by_name, deleted_at, deleted_by_name";

export function ClinicNotes() {
  const qc = useQueryClient();
  const { user, staffProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);

  const authorName = staffProfile
    ? `${staffProfile.firstName} ${staffProfile.lastName}`.trim()
    : null;

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["clinic-notes"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinic_notes")
        .select(COLUMNS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ClinicNote[];
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["clinic-notes"] });

  const addNote = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.from("clinic_notes").insert({
        body,
        created_by: user?.id ?? null,
        created_by_name: authorName,
      });
      if (error) throw error;
    },
    onSuccess: () => { setDraft(""); refresh(); toast.success("Note saved"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const editNote = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const { error } = await supabase
        .from("clinic_notes")
        .update({ body, updated_by: user?.id ?? null, updated_by_name: authorName })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setEditingId(null); setEditDraft(""); refresh(); toast.success("Note updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Out of the list, not out of the database. */
  const deleteNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("clinic_notes")
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null, deleted_by_name: authorName })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Note deleted — it can be restored below"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreNote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("clinic_notes")
        .update({ deleted_at: null, deleted_by: null, deleted_by_name: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("Note restored"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const live = useMemo(
    () => liveNotes(notes).filter((n) => noteMatchesSearch(n, query)),
    [notes, query],
  );
  const removed = useMemo(() => deletedNotes(notes), [notes]);
  const busy = addNote.isPending || editNote.isPending || deleteNote.isPending || restoreNote.isPending;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 md:h-9 md:w-9">
          <NotebookPen className="h-4 w-4 md:h-5 md:w-5" />
          <span className="sr-only">Notes</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="font-display text-base">Notes</SheetTitle>
        </SheetHeader>

        <div className="space-y-2 border-b px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 pr-8"
              placeholder="Search notes…"
              aria-label="Search notes"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setQuery("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {query.trim() && (
            <p className="text-[11px] text-muted-foreground">{noteSearchSummary(live.length, query)}</p>
          )}
        </div>

        {/* Writing a new one, always at the top - the open page of the book. */}
        <div className="space-y-2 border-b px-4 py-3">
          <Textarea
            rows={3}
            placeholder="Write a note…"
            aria-label="New note"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={noteBodyIsEmpty(draft) || busy}
            onClick={() => addNote.mutate(cleanNoteBody(draft))}
          >
            {addNote.isPending ? "Saving…" : "Save Note"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && live.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              {query.trim() ? "No notes match that." : "Nothing written yet."}
            </p>
          )}

          {live.map((note) => (
            <div key={note.id} className="border-b px-4 py-3 last:border-b-0">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {noteStamp(note.created_at)}
                  {note.created_by_name ? ` · ${note.created_by_name}` : ""}
                  {noteWasEdited(note) ? " · edited" : ""}
                </p>
                {editingId !== note.id && (
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Edit note"
                      disabled={busy}
                      onClick={() => { setEditingId(note.id); setEditDraft(note.body); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      aria-label="Delete note"
                      disabled={busy}
                      onClick={() => deleteNote.mutate(note.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {editingId === note.id ? (
                <div className="mt-2 space-y-2">
                  <Textarea
                    rows={3}
                    aria-label="Edit note"
                    value={editDraft}
                    disabled={busy}
                    onChange={(e) => setEditDraft(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={noteBodyIsEmpty(editDraft) || busy}
                      onClick={() => editNote.mutate({ id: note.id, body: cleanNoteBody(editDraft) })}
                    >
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                // Rough notes are typed with line breaks, and they are kept.
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{note.body}</p>
              )}
            </div>
          ))}
        </div>

        {removed.length > 0 && (
          <div className="border-t">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
              onClick={() => setShowDeleted((s) => !s)}
            >
              <span>Deleted notes ({removed.length})</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showDeleted ? "rotate-180" : ""}`} />
            </button>
            {showDeleted && (
              <div className="max-h-48 overflow-y-auto border-t">
                {removed.map((note) => (
                  <div key={note.id} className="flex items-center gap-2 border-b px-4 py-2 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs">{noteSummary(note.body)}</p>
                      <p className="text-[11px] text-muted-foreground">{noteStamp(note.created_at)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 gap-1 px-2 text-xs"
                      disabled={busy}
                      onClick={() => restoreNote.mutate(note.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
