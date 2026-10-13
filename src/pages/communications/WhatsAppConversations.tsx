import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ArrowLeft, MessagesSquare, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";

type Message = {
  id: string;
  phone: string;
  direction: string;
  role: string;
  content: string;
  created_at: string;
  patients: { first_name: string; last_name: string | null } | null;
};

type Thread = { phone: string; name: string; messages: Message[] };

export default function WhatsAppConversations() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["whatsapp-conversations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("id, phone, direction, role, content, created_at, patients(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []) as unknown as Message[];
    },
    refetchInterval: 30_000,
  });

  const threads = useMemo(() => {
    const byPhone = new Map<string, Message[]>();
    for (const m of data) {
      const list = byPhone.get(m.phone);
      if (list) list.push(m);
      else byPhone.set(m.phone, [m]);
    }
    return Array.from(byPhone.entries()).map(([phone, messages]): Thread => {
      const p = messages.find((m) => m.patients)?.patients;
      return { phone, name: p ? `${p.first_name} ${p.last_name || ""}`.trim() : phone, messages };
    });
  }, [data]);

  const visible = threads.filter((t) => {
    const q = search.trim().toLowerCase();
    return !q || t.name.toLowerCase().includes(q) || t.phone.includes(q);
  });
  const active = threads.find((t) => t.phone === selected) ?? null;
  const ordered = active ? [...active.messages].reverse() : [];

  return (
    <div>
      <div className="page-header">
        <Link to="/communications/whatsapp" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-4 w-4" /> WhatsApp Center
        </Link>
        <h1 className="page-title flex items-center gap-2">
          <MessagesSquare className="h-6 w-6 text-primary" /> WhatsApp Conversations
        </h1>
        <p className="page-subtitle">Chats between patients and the clinic's WhatsApp assistant</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardContent className="p-3">
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search name or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <ScrollArea className="h-[60vh]">
              {isLoading ? (
                <Skeleton className="h-40" />
              ) : visible.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No conversations found.</p>
              ) : (
                visible.map((t) => (
                  <button
                    key={t.phone}
                    onClick={() => setSelected(t.phone)}
                    className={`w-full rounded-md px-3 py-2 text-left hover:bg-muted ${selected === t.phone ? "bg-muted" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{t.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(t.messages[0].created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{t.messages[0].content}</p>
                  </button>
                ))
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            {!active ? (
              <p className="py-24 text-center text-sm text-muted-foreground">Select a conversation to read it.</p>
            ) : (
              <>
                <div className="mb-3 border-b pb-3">
                  <p className="font-medium">{active.name}</p>
                  <p className="text-xs text-muted-foreground">{active.phone}</p>
                </div>
                <ScrollArea className="h-[55vh]">
                  <div className="flex flex-col gap-2 pr-3">
                    {ordered.map((m) => {
                      const outbound = m.direction === "outbound";
                      return (
                        <div key={m.id} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                          <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${outbound ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                            <p className="whitespace-pre-wrap">{m.content}</p>
                            <p className={`mt-1 text-[10px] ${outbound ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                              {format(new Date(m.created_at), "d MMM, h:mm a")}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
