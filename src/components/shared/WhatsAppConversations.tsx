import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { Link } from "react-router-dom";
import { AlertCircle, Clock3, Loader2, Search, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DateInput } from "@/components/shared/DateInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getReportDateRange, REPORT_DATE_RANGE_OPTIONS } from "@/lib/reportDateRange";
import { sanitizeTerm } from "@/lib/fuzzySearch";
import { replyWindow } from "@/lib/whatsappReplyWindow";
import { CONVERSATION_POLL_MS } from "@/lib/whatsappAutoSync";
import { isThreadUnread, unreadCount, READ_BASELINE_PHONE } from "@/lib/whatsappUnread";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import {
  deliveryNote,
  summaryFromThread,
  type ConversationMessage,
  type ConversationThread,
  type PatientJoin,
  type ThreadMessage,
} from "@/lib/whatsappThreads";

/**
 * Conversations per page, not messages per page.
 *
 * The list used to be built by fetching the newest 100 MESSAGES and grouping
 * them by number, so it showed whichever numbers happened to fall inside that
 * window - 37 of the clinic's 154, and no way to reach the rest without
 * loading every message, which is the bulk load this page is supposed to
 * avoid. whatsapp_conversation_threads gives one row per number, so a page of
 * the list is a page of conversations.
 */
const LIST_PAGE_SIZE = 50;
const THREAD_PAGE_SIZE = 50;

function patientFrom(message: ConversationMessage): PatientJoin | null {
  if (Array.isArray(message.patients)) return message.patients[0] ?? null;
  return message.patients;
}

function patientName(message: ConversationMessage): string {
  const patient = patientFrom(message);
  return [patient?.first_name, patient?.last_name].filter(Boolean).join(" ").trim();
}

function dayLabel(value: string): string {
  const date = new Date(value);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "dd MMM yyyy");
}

function applyDateRange<T>(query: T, start?: Date, end?: Date, column = "created_at"): T {
  let next = query as T & {
    gte: (column: string, value: string) => T;
    lte: (column: string, value: string) => T;
  };
  if (start) next = next.gte(column, start.toISOString()) as typeof next;
  if (end) next = next.lte(column, end.toISOString()) as typeof next;
  return next as T;
}

interface WhatsAppConversationsProps {
  /** Lets the page show the count beside its Conversations tab. */
  onUnreadCountChange?: (count: number) => void;
}

export function WhatsAppConversations({ onUnreadCountChange }: WhatsAppConversationsProps = {}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  // The whole history, not the current month: this is a conversation
  // inbox, not a report, and 103 of the clinic's 154 numbers last spoke
  // before this month. The view costs one row per number, so All Time is
  // cheap; the period picker beside it still narrows in one click.
  const [preset, setPreset] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const range = useMemo(
    () => getReportDateRange(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );
  const rangeKey = `${range.start?.toISOString() ?? "all"}:${range.end?.toISOString() ?? "all"}`;

  const matchingPatients = useInfiniteQuery({
    queryKey: ["whatsapp-conversation-patient-search", deferredSearch],
    enabled: deferredSearch.length > 0,
    initialPageParam: 0,
    queryFn: async () => {
      const terms = sanitizeTerm(deferredSearch).split(/\s+/).filter(Boolean);
      if (terms.length === 0) return [] as { id: string }[];
      let query = supabase.from("patients").select("id").limit(100);
      for (const term of terms) {
        query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    getNextPageParam: () => undefined,
  });

  const matchingPatientIds = useMemo(
    () => matchingPatients.data?.pages.flat().map((patient) => patient.id) ?? [],
    [matchingPatients.data],
  );

  const conversations = useInfiniteQuery({
    queryKey: ["whatsapp-conversations", deferredSearch, matchingPatientIds.join(","), rangeKey],
    enabled: deferredSearch.length === 0 || matchingPatients.isSuccess,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * LIST_PAGE_SIZE;
      let query = supabase
        .from("whatsapp_conversation_threads")
        .select("phone, last_at, last_inbound_at, message_count, last_content, last_direction, patient_id, first_name, last_name")
        .order("last_at", { ascending: false })
        .range(from, from + LIST_PAGE_SIZE - 1);
      // The range picks which conversations are listed, by when they last
      // spoke. The thread itself is always shown whole - a date window that
      // hides half a conversation is what this page was reported for.
      query = applyDateRange(query, range.start, range.end, "last_at");
      if (deferredSearch) {
        const phoneTerm = sanitizeTerm(deferredSearch).replace(/\s+/g, "");
        const clauses = [`phone.ilike.%${phoneTerm}%`];
        if (matchingPatientIds.length > 0) clauses.push(`patient_id.in.(${matchingPatientIds.join(",")})`);
        query = query.or(clauses.join(","));
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ConversationThread[];
    },
    getNextPageParam: (lastPage, pages) => lastPage.length === LIST_PAGE_SIZE ? pages.length : undefined,
    // So a thread moves to the top when the patient writes, without anyone
    // pressing Refresh - see whatsappAutoSync.ts.
    refetchInterval: CONVERSATION_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const summariesWithCounts = useMemo(
    () => (conversations.data?.pages.flat() ?? []).map(summaryFromThread),
    [conversations.data],
  );

  // When this person last opened each thread. One small indexed read on the
  // same clock as the list, so a reply that lands lights up on its own.
  const reads = useQuery({
    queryKey: ["whatsapp-thread-reads"],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from("whatsapp_thread_reads")
        .select("phone, last_read_at")
        .eq("user_id", uid);
      if (error) throw error;
      const byPhone: Record<string, string> = {};
      for (const row of data ?? []) byPhone[row.phone] = row.last_read_at;

      // The first time somebody opens this page, everything older than now
      // counts as seen. Without it the mark arrives on all 178 threads a
      // patient has ever written to, which can only be cleared by opening all
      // 178 - the very thing it exists to save.
      if (Object.keys(byPhone).length === 0) {
        const baseline = new Date().toISOString();
        const { error: seedError } = await supabase
          .from("whatsapp_thread_reads")
          .upsert({ user_id: uid, phone: READ_BASELINE_PHONE, last_read_at: baseline }, { onConflict: "user_id,phone" });
        if (seedError) console.error("Could not record the unread baseline", seedError);
        else byPhone[READ_BASELINE_PHONE] = baseline;
      }
      return byPhone;
    },
    refetchInterval: CONVERSATION_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const readMarks = useMemo(() => {
    const byPhone = reads.data ?? {};
    return { byPhone, baseline: byPhone[READ_BASELINE_PHONE] ?? null };
  }, [reads.data]);

  const unreadThreads = useMemo(
    () => summariesWithCounts.map((summary) => ({
      phone: summary.phone,
      last_inbound_at: summary.lastInboundAt ?? null,
    })),
    [summariesWithCounts],
  );
  const unread = unreadCount(unreadThreads, readMarks);
  useEffect(() => { onUnreadCountChange?.(unread); }, [unread, onUnreadCountChange]);

  /**
   * Opening a thread is reading it.
   *
   * Written before the list refetches rather than after, so the dot clears the
   * moment it is clicked - waiting twenty seconds for the next poll to agree
   * would have the clinic clicking twice.
   */
  const markRead = useCallback(async (phone: string) => {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    queryClient.setQueryData(["whatsapp-thread-reads"], (prev: Record<string, string> | undefined) => ({
      ...(prev ?? {}),
      [phone]: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("whatsapp_thread_reads")
      .upsert({ user_id: uid, phone, last_read_at: new Date().toISOString() }, { onConflict: "user_id,phone" });
    // A mark that failed to save is not worth interrupting anyone over - the
    // next open writes it again - but it should not vanish silently either.
    if (error) console.error("Could not mark the conversation read", error);
  }, [queryClient]);

  useEffect(() => {
    if (!selectedPhone || !summariesWithCounts.some((item) => item.phone === selectedPhone)) {
      setSelectedPhone(summariesWithCounts[0]?.phone ?? null);
    }
  }, [selectedPhone, summariesWithCounts]);

  const selectedSummary = summariesWithCounts.find((item) => item.phone === selectedPhone) ?? null;

  // Not keyed on the date range: the thread is the conversation, all of it -
  // and read from whatsapp_thread_messages, so what the clinic sent sits in
  // the timeline beside what the patient replied.
  const thread = useInfiniteQuery({
    queryKey: ["whatsapp-conversation-thread", selectedPhone],
    enabled: Boolean(selectedPhone),
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      if (!selectedPhone) return [] as ThreadMessage[];
      const from = pageParam * THREAD_PAGE_SIZE;
      const { data, error } = await supabase
        .from("whatsapp_thread_messages")
        .select("id, phone, patient_id, direction, content, created_at, source, status")
        .eq("phone", selectedPhone)
        .order("created_at", { ascending: false })
        .range(from, from + THREAD_PAGE_SIZE - 1);
      if (error) throw error;
      return (data ?? []) as ThreadMessage[];
    },
    getNextPageParam: (lastPage, pages) => lastPage.length === THREAD_PAGE_SIZE ? pages.length : undefined,
    // A patient's reply is in the database the moment they send it - the
    // webhook writes it - so the open thread only ever needed to look again.
    // React Query pauses this while the tab is hidden, so a screen left open
    // overnight costs nothing.
    refetchInterval: CONVERSATION_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const threadMessages = useMemo(
    () => (thread.data?.pages.flat() ?? []).slice().reverse(),
    [thread.data],
  );

  useEffect(() => {
    if (threadMessages.length > 0 && thread.data?.pages.length === 1) {
      threadEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [selectedPhone, threadMessages.length, thread.data?.pages.length]);

  // Replying. WhatsApp only delivers a freely typed message within 24 hours of
  // the patient's last one, so the window is read from the thread itself - the
  // most recent message that came IN - and the box says so when it has closed
  // rather than letting the front desk type into a refusal.
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const lastInboundAt = useMemo(() => {
    for (let i = threadMessages.length - 1; i >= 0; i -= 1) {
      if (threadMessages[i].direction === "inbound") return threadMessages[i].created_at;
    }
    return null;
  }, [threadMessages]);
  const window24h = useMemo(() => replyWindow(lastInboundAt), [lastInboundAt]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !selectedPhone || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("whatsapp-send-reply", {
        body: { phone: selectedPhone, message: text },
      });
      // supabase-js flattens every non-2xx to one sentence and drops the body,
      // so the function's own words - the 24-hour refusal among them - are
      // recovered rather than guessed at.
      if (error) {
        throw new Error(
          await edgeFunctionErrorMessage(error, "The reply could not be sent. Please try again."),
        );
      }
      setReply("");
      await queryClient.invalidateQueries({ queryKey: ["whatsapp-conversation-thread", selectedPhone] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      threadEndRef.current?.scrollIntoView({ block: "end" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The reply could not be sent");
    } finally {
      setSending(false);
    }
  };

  const noMatches = Boolean(deferredSearch) && summariesWithCounts.length === 0;

  return (
    <div className="space-y-3">
      <div className="data-table p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient name or phone…"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="min-w-[160px]">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Date range</label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {REPORT_DATE_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.key} value={option.key} className="text-xs">{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {preset === "custom" && (
            <>
              <div className="min-w-[130px]">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</label>
                <DateInput value={customStart} onChange={setCustomStart} className="h-8 text-xs" />
              </div>
              <div className="min-w-[130px]">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</label>
                <DateInput value={customEnd} onChange={setCustomEnd} className="h-8 text-xs" />
              </div>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex min-h-[560px] flex-col md:h-[68vh] md:min-h-[560px] md:flex-row">
            <section className="flex max-h-[360px] min-h-[260px] flex-col border-b md:h-full md:max-h-none md:w-[22rem] md:border-b-0 md:border-r" aria-label="Conversation list">
              <div className="border-b px-4 py-3">
                <h2 className="font-semibold">Conversations</h2>
                <p className="text-xs text-muted-foreground">{summariesWithCounts.length} numbers shown</p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {conversations.isLoading || matchingPatients.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading conversations…
                  </div>
                ) : conversations.isError || matchingPatients.isError ? (
                  <div className="p-6 text-center text-sm text-destructive">Could not load conversations.</div>
                ) : summariesWithCounts.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    {noMatches ? "No conversations match your search." : "No messages in this date range."}
                  </div>
                ) : (
                  summariesWithCounts.map((summary) => {
                    const name = patientName(summary);
                    const isUnread = isThreadUnread(
                      { phone: summary.phone, last_inbound_at: summary.lastInboundAt ?? null },
                      readMarks,
                    );
                    return (
                      <button
                        key={summary.phone}
                        type="button"
                        onClick={() => { setSelectedPhone(summary.phone); void markRead(summary.phone); }}
                        className={cn(
                          "w-full border-b px-4 py-3 text-left transition-colors hover:bg-muted/50",
                          selectedPhone === summary.phone && "bg-primary/10",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-start gap-2">
                            {/* The mark front desk asked for: a thread the
                                patient has written to since anyone here last
                                opened it. An outbound last message never
                                carries one, which is what the old "Waiting"
                                chip could not tell apart. */}
                            <span
                              aria-label={isUnread ? "Unread reply" : undefined}
                              className={cn(
                                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                                isUnread ? "bg-success" : "bg-transparent",
                              )}
                            />
                            <div className="min-w-0">
                              <p className={cn("truncate text-sm", isUnread ? "font-semibold" : "font-medium")}>
                                {name || summary.phone}
                              </p>
                              {name && <p className="truncate text-xs text-muted-foreground">{summary.phone}</p>}
                            </div>
                          </div>
                          <time className="shrink-0 text-[11px] text-muted-foreground">{format(new Date(summary.created_at), "dd MMM, hh:mm a")}</time>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{summary.content}</p>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          <span>{summary.messageCount ?? "…"} messages</span>
                          {isUnread && (
                            <span className="inline-flex items-center gap-1 font-medium text-success">
                              <Clock3 className="h-3 w-3" /> New reply
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
                {conversations.hasNextPage && (
                  <div className="p-3 text-center">
                    <Button variant="outline" size="sm" onClick={() => conversations.fetchNextPage()} disabled={conversations.isFetchingNextPage}>
                      {conversations.isFetchingNextPage && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      Load more conversations
                    </Button>
                  </div>
                )}
              </div>
            </section>

            <section className="flex min-h-[420px] min-w-0 flex-1 flex-col md:h-full" aria-label="Selected conversation">
              {!selectedSummary ? (
                <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                  {summariesWithCounts.length === 0 ? "No conversation to display." : "Select a conversation."}
                </div>
              ) : (
                <>
                  <header className="border-b px-4 py-3">
                    {selectedSummary.patient_id && patientName(selectedSummary) ? (
                      <Link className="font-semibold text-primary hover:underline" to={`/patients/${selectedSummary.patient_id}`}>
                        {patientName(selectedSummary)}
                      </Link>
                    ) : (
                      <h2 className="font-semibold">{selectedSummary.phone}</h2>
                    )}
                    {selectedSummary.patient_id && patientName(selectedSummary) && (
                      <p className="text-xs text-muted-foreground">{selectedSummary.phone}</p>
                    )}
                  </header>
                  <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4">
                    {thread.hasNextPage && (
                      <div className="mb-4 text-center">
                        <Button variant="outline" size="sm" onClick={() => thread.fetchNextPage()} disabled={thread.isFetchingNextPage}>
                          {thread.isFetchingNextPage && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                          Load earlier messages
                        </Button>
                      </div>
                    )}
                    {thread.isLoading ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading thread…
                      </div>
                    ) : thread.isError ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4" /> Could not load this conversation.
                      </div>
                    ) : threadMessages.length === 0 ? (
                      <div className="py-12 text-center text-sm text-muted-foreground">No messages for this number yet.</div>
                    ) : (
                      <div className="space-y-3">
                        {threadMessages.map((message, index) => {
                          const previous = threadMessages[index - 1];
                          const showDay = !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at);
                          const inbound = message.direction === "inbound";
                          const note = deliveryNote(message);
                          return (
                            <Fragment key={message.id}>
                              {showDay && (
                                <div className="flex items-center gap-3 py-1" aria-label={dayLabel(message.created_at)}>
                                  <div className="h-px flex-1 bg-border" />
                                  <span className="text-[11px] font-medium text-muted-foreground">{dayLabel(message.created_at)}</span>
                                  <div className="h-px flex-1 bg-border" />
                                </div>
                              )}
                              <div className={cn("flex", inbound ? "justify-start" : "justify-end")}>
                                <div className={cn(
                                  "max-w-[85%] rounded-lg px-3 py-2 text-sm sm:max-w-[72%]",
                                  inbound ? "bg-muted text-foreground" : "bg-primary text-primary-foreground",
                                )}>
                                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                  <div className={cn("mt-1 flex items-center gap-1.5 text-[10px]", inbound ? "text-muted-foreground" : "text-primary-foreground/75")}>
                                    <time>{format(new Date(message.created_at), "hh:mm a")}</time>
                                    {note && <span className="font-medium">· {note}</span>}
                                  </div>
                                </div>
                              </div>
                            </Fragment>
                          );
                        })}
                        <div ref={threadEndRef} />
                      </div>
                    )}
                  </div>

                  {/* The reply. Front desk read a patient asking a question and
                      had to pick up a phone; this answers from the clinic's own
                      number, and what is sent appears in the thread above. */}
                  <div className="border-t bg-background p-3">
                    <div className="flex items-end gap-2">
                      <Textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        onKeyDown={(e) => {
                          // Enter sends, as it does in every messaging app;
                          // Shift+Enter is how a second line is written.
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendReply();
                          }
                        }}
                        disabled={!window24h.open || sending}
                        rows={2}
                        placeholder={window24h.open ? "Write a reply…" : "Replies are closed for this number"}
                        className="min-h-[44px] resize-none"
                      />
                      <Button
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        aria-label="Send reply"
                        disabled={!window24h.open || sending || !reply.trim()}
                        onClick={sendReply}
                      >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {window24h.open
                        ? "Sent from the clinic's WhatsApp number. Enter sends, Shift+Enter starts a new line."
                        : window24h.note}
                    </p>
                  </div>
                </>
              )}
            </section>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}