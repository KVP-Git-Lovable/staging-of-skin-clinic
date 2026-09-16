import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { MessageCircle, FileText, Megaphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type ConversationRow = {
  id: string;
  phone: string;
  patient_id: string | null;
  direction: string;
  role: string;
  content: string;
  created_at: string;
  patients: { first_name: string; last_name: string | null } | null;
};

function ConversationsCard() {
  const { data: threads = [], isLoading } = useQuery({
    queryKey: ["whatsapp-conversations-recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_conversations")
        .select("id, phone, patient_id, direction, role, content, created_at, patients(first_name, last_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as unknown as ConversationRow[];
    },
  });

  const latestByPhone = useMemo(() => {
    const seen = new Map<string, ConversationRow>();
    for (const row of threads) {
      if (!seen.has(row.phone)) seen.set(row.phone, row);
    }
    return Array.from(seen.values()).slice(0, 20);
  }, [threads]);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="h-4 w-4 text-primary" /> Conversations
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading conversations…</p>
        ) : latestByPhone.length === 0 ? (
          <p className="text-sm text-muted-foreground">No WhatsApp conversations yet.</p>
        ) : (
          <div className="divide-y">
            {latestByPhone.map((thread) => {
              const name = thread.patients
                ? `${thread.patients.first_name} ${thread.patients.last_name || ""}`.trim()
                : thread.phone;
              return (
                <div key={thread.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{name}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-md">{thread.content}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{thread.direction}</Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ComingSoonCard({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base text-muted-foreground">
          <Icon className="h-4 w-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Badge variant="outline" className="mt-2">Coming soon</Badge>
      </CardContent>
    </Card>
  );
}

export default function WhatsAppCenter() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-primary" /> WhatsApp
        </h1>
        <p className="page-subtitle">
          Part of the <Link to="/communications/whatsapp" className="underline">Communications Center</Link>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ConversationsCard />
        <ComingSoonCard icon={FileText} title="Templates" description="Manage approved WhatsApp message templates." />
        <ComingSoonCard icon={Megaphone} title="Broadcast" description="Send a WhatsApp message to a patient audience." />
      </div>
    </div>
  );
}
