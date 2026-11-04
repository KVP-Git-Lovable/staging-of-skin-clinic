import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { streamImage } from "@/lib/knowledgeImageStream";
import type { KnowledgeResource } from "@/lib/knowledge";
import { Button } from "@/components/ui/button";
import { uploadKnowledgeFile } from "./ArticleResources";

export function KnowledgePicture({ serviceId, group, onAdd, onBusyChange }: { serviceId: string; group: string; onAdd: (resource: KnowledgeResource) => void; onBusyChange?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false); const [frame, setFrame] = useState(""); const [final, setFinal] = useState(false);
  const abort = useRef<AbortController>();
  const generate = async () => {
    if (!serviceId) { toast.error("Choose a service first"); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Please sign in"); return; }
    abort.current = new AbortController(); setBusy(true); onBusyChange?.(true); setFrame(""); setFinal(false);
    try { await streamImage(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/knowledge-ai`, { action: "picture", service_id: serviceId }, (url, complete) => { setFrame(url); setFinal(complete); }, abort.current.signal, { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }); }
    catch (e) { setFinal(false); if (!(e instanceof Error && e.name === "AbortError")) toast.error(e instanceof Error ? e.message : "Picture generation failed"); }
    finally { setBusy(false); onBusyChange?.(false); }
  };
  return <section className="border-t pt-4 space-y-3"><Button variant="outline" size="sm" onClick={generate} disabled={busy}><ImagePlus className="h-4 w-4 mr-2" />Generate educational picture</Button>{busy && <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}><Loader2 className="h-4 w-4 mr-2 animate-spin" />Stop</Button>}
    {frame && <img src={frame} alt="AI-generated educational illustration awaiting clinical review" className={`max-h-80 max-w-full object-contain ${final ? "" : "blur-md"}`} />}
    {final && <div className="space-y-2"><p className="text-xs text-warning">AI-generated illustration — not a patient photo or clinical evidence. Review accuracy before attaching.</p><Button variant="outline" size="sm" disabled={busy} onClick={async () => {
      setBusy(true); onBusyChange?.(true);
      try { const blob = await (await fetch(frame)).blob(); const resource = await uploadKnowledgeFile(new File([blob], "AI educational illustration.png", { type: "image/png" }), group); onAdd({ ...resource, note: "AI-generated educational illustration, not a real patient photograph or independent clinical evidence." }); setFrame(""); setFinal(false); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Picture could not be attached"); } finally { setBusy(false); onBusyChange?.(false); }
    }}>Accept picture into draft</Button><Button variant="ghost" size="sm" onClick={() => { setFrame(""); setFinal(false); }}>Discard picture</Button></div>}
  </section>;
}