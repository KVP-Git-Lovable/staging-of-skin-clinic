import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/shared/MicButton";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUserNames } from "@/lib/history";
import { stickyNoteOwner, type StickyNoteOwner } from "@/lib/stickyNoteOwner";

/**
 * A note being composed before its procedure exists. `key` is a stable local id -
 * it survives edits (so the card colour doesn't reshuffle while typing) and is what
 * the caller keys React children off.
 */
export interface DraftNote {
  key: string;
  title: string;
  content: string;
}

const newDraftNoteKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface Props {
  /** Saved mode: notes are read from and written to this procedure directly. */
  procedureId?: string | null;
  /** Saved mode: the same, for notes written against an appointment. */
  appointmentId?: string | null;
  /** Draft mode (neither id): the caller owns the buffer and flushes it after the insert. */
  notes?: DraftNote[];
  onNotesChange?: (next: DraftNote[]) => void;
  className?: string;
  /**
   * What a freshly opened composer starts with. The appointment Notes tab
   * passes the assigned therapist's name as the title, so nobody has to type
   * who did the treatment. Optional and absent on procedures, which open
   * empty exactly as before. Always editable, and never applied to a note
   * that already exists.
   */
  composerDefaults?: { title?: string; content?: string };
}

/** A persisted row of procedure_sticky_notes or appointment_sticky_notes. */
interface StickyNoteRow {
  id: string;
  title: string | null;
  content: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What the card grid renders, whichever mode we're in. */
interface NoteView {
  key: string;
  title: string | null;
  content: string;
  attribution: string;
}

const NOTE_PALETTE = [
  "bg-amber-50 border-amber-200",
  "bg-rose-50 border-rose-200",
  "bg-sky-50 border-sky-200",
  "bg-emerald-50 border-emerald-200",
  "bg-violet-50 border-violet-200",
  "bg-orange-50 border-orange-200",
];
const noteColor = (id: string) => {
  const sum = id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return NOTE_PALETTE[sum % NOTE_PALETTE.length];
};

/**
 * The notes table, typed.
 *
 * appointment_sticky_notes post-dates the generated Supabase types, and a union
 * of two table names defeats their inference in any case. The two tables have
 * identical columns, so the client is typed against one of them while the table
 * actually queried is the one in `owner` at runtime. A narrow cast here beats
 * either branching at all five call sites or `as any` over whole queries.
 */
const notesTable = (table: StickyNoteOwner["table"]) =>
  supabase.from(table as "procedure_sticky_notes");

/** The owner column, narrowed for the same reason as notesTable. */
const notesColumn = (column: StickyNoteOwner["column"]) => column as "procedure_id";

/**
 * A new note's row, for either table.
 *
 * created_by and updated_by are omitted on purpose, so the stamp_audit_user
 * trigger fills them from auth.uid(). It COALESCEs rather than overrides, so
 * sending them from here would silently take precedence over the real author.
 *
 * All three casts here disappear once appointment_sticky_notes reaches the
 * generated types - they are about types lagging a migration, not about the
 * query being unsound.
 */
const notesInsert = (owner: StickyNoteOwner, title: string | null, content: string) =>
  ({ [owner.column]: owner.id, title, content }) as {
    procedure_id: string;
    title: string | null;
    content: string;
  };

export function StickyNotes({ procedureId, appointmentId, notes, onNotesChange, className, composerDefaults }: Props) {
  const owner = stickyNoteOwner({ procedureId, appointmentId });
  const draftMode = !owner;
  const draftNotes = notes ?? [];

  const [newNoteOpen, setNewNoteOpen] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  // In draft mode the composer writes straight through to the caller's buffer, so a
  // half-typed note is never lost when the procedure is saved. This is the key of the
  // entry it's writing into - excluded from the grid below so it doesn't render twice.
  const [composingKey, setComposingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [editingContent, setEditingContent] = useState("");

  const { data: stickyNotes = [], refetch: refetchStickyNotes } = useQuery({
    // Keyed by table as well as id: a procedure and an appointment could
    // otherwise share a cache entry on equal uuids.
    queryKey: ["sticky-notes", owner?.table, owner?.id],
    queryFn: async () => {
      if (!owner) return [];
      const { data, error } = await notesTable(owner.table)
        .select("*")
        .eq(notesColumn(owner.column), owner.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!owner,
  });

  const noteUserIds = (stickyNotes as StickyNoteRow[]).flatMap((n) => [n.created_by, n.updated_by]);
  const { data: noteUserNames = {} } = useUserNames(noteUserIds);

  const noteAttribution = (note: StickyNoteRow) => {
    const edited = note.updated_at !== note.created_at;
    const userId = edited ? note.updated_by : note.created_by;
    const name = (userId && noteUserNames[userId]) || "Someone";
    const when = formatDistanceToNow(new Date(edited ? note.updated_at : note.created_at), { addSuffix: true });
    return `${edited ? "Edited" : "Added"} by ${name} · ${when}`;
  };

  // Newest first in both modes - saved notes come back ordered by updated_at desc,
  // the draft buffer is appended to in the order it was written.
  const views: NoteView[] = draftMode
    ? draftNotes
        .filter((n) => n.key !== composingKey)
        .map((n) => ({ key: n.key, title: n.title || null, content: n.content, attribution: "Not saved yet" }))
        .reverse()
    : (stickyNotes as StickyNoteRow[]).map((n) => ({
        key: n.id,
        title: n.title,
        content: n.content,
        attribution: noteAttribution(n),
      }));

  const openComposer = () => {
    // A blank string is the same as no default: the composer opens empty
    // rather than with a title about nobody.
    const title = composerDefaults?.title?.trim() || "";
    const content = composerDefaults?.content?.trim() || "";
    setNewNoteOpen(true);
    setNewNoteTitle(title);
    setNewNoteContent(content);
    if (draftMode) {
      const key = newDraftNoteKey();
      setComposingKey(key);
      onNotesChange?.([...draftNotes, { key, title, content }]);
    }
  };

  const updateComposer = (patch: Partial<Pick<DraftNote, "title" | "content">>) => {
    if (patch.title !== undefined) setNewNoteTitle(patch.title);
    if (patch.content !== undefined) setNewNoteContent(patch.content);
    if (draftMode && composingKey) {
      onNotesChange?.(draftNotes.map((n) => (n.key === composingKey ? { ...n, ...patch } : n)));
    }
  };

  const closeComposer = () => {
    setNewNoteOpen(false);
    setComposingKey(null);
    setNewNoteTitle("");
    setNewNoteContent("");
  };

  const cancelComposer = () => {
    if (draftMode && composingKey) onNotesChange?.(draftNotes.filter((n) => n.key !== composingKey));
    closeComposer();
  };

  const addNote = async () => {
    if (!newNoteContent.trim()) return;
    if (draftMode) {
      // Already written through by updateComposer - just trim and release it into the grid.
      if (composingKey) {
        onNotesChange?.(
          draftNotes.map((n) =>
            n.key === composingKey ? { ...n, title: newNoteTitle.trim(), content: newNoteContent.trim() } : n,
          ),
        );
      }
      closeComposer();
      return;
    }
    const { error } = await notesTable(owner.table).insert(
      notesInsert(owner, newNoteTitle.trim() || null, newNoteContent.trim()),
    );
    if (error) { toast.error(error.message); return; }
    closeComposer();
    refetchStickyNotes();
  };

  const startEditNote = (note: NoteView) => {
    setEditingKey(note.key);
    setEditingTitle(note.title || "");
    setEditingContent(note.content || "");
  };

  const saveEditNote = async () => {
    if (!editingKey) return;
    const key = editingKey;
    setEditingKey(null);
    if (draftMode) {
      const content = editingContent.trim();
      onNotesChange?.(
        content
          ? draftNotes.map((n) => (n.key === key ? { ...n, title: editingTitle.trim(), content } : n))
          : draftNotes.filter((n) => n.key !== key),
      );
      return;
    }
    const { error } = await notesTable(owner.table)
      .update({ title: editingTitle.trim() || null, content: editingContent.trim() })
      .eq("id", key);
    if (error) { toast.error(error.message); return; }
    refetchStickyNotes();
  };

  const deleteNote = async (key: string) => {
    if (editingKey === key) setEditingKey(null);
    if (draftMode) {
      onNotesChange?.(draftNotes.filter((n) => n.key !== key));
      toast.success("Note deleted");
      return;
    }
    await notesTable(owner.table).delete().eq("id", key);
    refetchStickyNotes();
    toast.success("Note deleted");
  };

  return (
    <div className={cn("rounded-xl border bg-card p-4 shadow-sm", className)}>
      {draftMode && (
        <p className="text-xs text-muted-foreground mb-3">
          Notes are attached to the procedure when you save it.
        </p>
      )}
      {newNoteOpen ? (
        <div className="rounded-lg border bg-background p-3 space-y-2 shadow-sm mb-3">
          <Input
            placeholder="Title"
            value={newNoteTitle}
            onChange={(e) => updateComposer({ title: e.target.value })}
            className="border-0 px-0 text-sm font-medium focus-visible:ring-0 shadow-none"
          />
          <div className="flex items-start gap-1">
            <Textarea
              autoFocus
              placeholder="Take a note..."
              value={newNoteContent}
              onChange={(e) => updateComposer({ content: e.target.value })}
              rows={3}
              className="border-0 px-0 text-sm resize-none focus-visible:ring-0 shadow-none"
            />
            <MicButton value={newNoteContent} onChange={(v) => updateComposer({ content: v })} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={cancelComposer}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={addNote} disabled={!newNoteContent.trim()}>
              Add
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={openComposer}
          className="w-full rounded-lg border bg-background px-3 py-2 text-left text-sm text-muted-foreground shadow-sm hover:shadow-md transition-shadow mb-3"
        >
          Add a note...
        </button>
      )}

      {views.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {views.map((note) => {
            const isEditing = editingKey === note.key;
            return (
              <div
                key={note.key}
                className={cn(
                  "relative rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow",
                  noteColor(note.key),
                )}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-6 w-6 opacity-60 hover:opacity-100"
                  onClick={() => deleteNote(note.key)}
                >
                  <X className="h-3 w-3" />
                </Button>
                {isEditing ? (
                  <div
                    className="space-y-1.5 pr-6"
                    onBlur={(e) => {
                      // Only save/exit once focus leaves this whole card - moving
                      // focus between the title and content fields (or the mic
                      // button) shouldn't prematurely close it.
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) saveEditNote();
                    }}
                  >
                    <Input
                      autoFocus
                      placeholder="Title"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="border-0 bg-transparent px-0 text-sm font-medium focus-visible:ring-0 shadow-none"
                    />
                    <div className="flex items-start gap-1">
                      <Textarea
                        placeholder="Take a note..."
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        rows={4}
                        className="border-0 bg-transparent px-0 text-sm resize-none focus-visible:ring-0 shadow-none"
                      />
                      <MicButton value={editingContent} onChange={setEditingContent} />
                    </div>
                  </div>
                ) : (
                  <div className="cursor-text pr-6" onClick={() => startEditNote(note)}>
                    {note.title && <p className="text-sm font-medium mb-1 break-words">{note.title}</p>}
                    <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-black/5">
                  {note.attribution}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        !newNoteOpen && (
          <p className="text-sm text-muted-foreground text-center py-2">No notes yet. Click "Add a note..." to create one.</p>
        )
      )}
    </div>
  );
}
