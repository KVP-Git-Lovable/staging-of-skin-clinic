import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { BackButton } from "@/components/shared/BackButton";
import { Facebook, Instagram, Loader2, Send, Upload } from "lucide-react";
import { CONNECTION_COLUMNS, PAGE_COLUMNS } from "@/lib/metaColumns";

export default function MetaOrganicPosts() {
  const [conn, setConn] = useState<any>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    post_type: "text", message: "", media_url: "", destination: "facebook",
    page_id: "", instagram_id: "", scheduled_at: "",
  });

  const load = async () => {
    setLoading(true);
    const { data: c } = await supabase.from("social_connections").select(CONNECTION_COLUMNS).eq("platform", "meta").maybeSingle();
    setConn(c);
    if (c) {
      const { data: p } = await supabase.from("social_pages").select(PAGE_COLUMNS).eq("connection_id", c.id);
      setPages(p || []);
      setForm((f) => ({
        ...f,
        page_id: f.page_id || (c as any).default_page_id || "",
        instagram_id: f.instagram_id || (c as any).default_instagram_id || "",
      }));
    }
    const { data: list } = await supabase.from("social_posts").select("*").eq("platform", "meta")
      .order("created_at", { ascending: false }).limit(50);
    setPosts(list || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const upload = async (file: File) => {
    setUploading(true);
    const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("social-media").upload(path, file, { upsert: true });
    if (error) {
      setUploading(false);
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
      return;
    }
    const { data } = supabase.storage.from("social-media").getPublicUrl(path);
    setForm((f) => ({ ...f, media_url: data.publicUrl }));
    setUploading(false);
    toast({ title: "Media uploaded" });
  };

  const submit = async (publishNow: boolean) => {
    if (!conn) { toast({ title: "Connect your Meta account first", variant: "destructive" }); return; }
    if (form.post_type !== "text" && !form.media_url) {
      toast({ title: "Upload an image or video first", variant: "destructive" }); return;
    }
    setPublishing(true);
    const { data: created, error } = await supabase.from("social_posts").insert({
      platform: "meta",
      connection_id: conn.id,
      post_type: form.post_type,
      message: form.message,
      media_url: form.media_url || null,
      destination: form.destination,
      page_id: form.page_id || null,
      instagram_id: form.instagram_id || null,
      scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      status: publishNow ? "publishing" : form.scheduled_at ? "scheduled" : "draft",
    }).select("id").single();

    if (error || !created) {
      setPublishing(false);
      toast({ title: "Could not save post", description: error?.message, variant: "destructive" });
      return;
    }

    if (!publishNow) {
      setPublishing(false);
      toast({ title: form.scheduled_at ? "Post scheduled" : "Draft saved" });
      load();
      return;
    }

    const { data, error: fnErr } = await supabase.functions.invoke("meta-api", {
      body: { action: "publish_post", payload: { post_id: created.id } },
    });
    setPublishing(false);
    if (fnErr || data?.error) {
      let description = data?.error || fnErr?.message;
      if (fnErr instanceof FunctionsHttpError) {
        try {
          const body = await fnErr.context.json();
          description = body?.error || description;
        } catch { /* keep default message */ }
      }
      toast({ title: "Publish failed", description, variant: "destructive" });
    } else if (data?.scheduled) {
      toast({
        title: "Post scheduled on Facebook",
        description: `Will go live at ${new Date(data.scheduled_at).toLocaleString()}`,
      });
      setForm((f) => ({ ...f, message: "", media_url: "", scheduled_at: "" }));
    } else {
      toast({ title: "Post published", description: data?.facebook_post_id ? `Post ID: ${data.facebook_post_id}` : undefined });
      setForm((f) => ({ ...f, message: "", media_url: "" }));
    }
    load();
  };

  const igOptions = pages.filter((p) => p.instagram_id);

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Organic Posts</h1>
        <p className="text-muted-foreground mt-1">Publish or schedule posts to your Facebook Page and Instagram account.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-xl">
          <CardHeader>
            <CardTitle>Compose</CardTitle>
            <CardDescription>Text, image or video content for Facebook, Instagram or both.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs value={form.post_type} onValueChange={(v) => setForm({ ...form, post_type: v })}>
              <TabsList>
                <TabsTrigger value="text">Text Post</TabsTrigger>
                <TabsTrigger value="image">Image Post</TabsTrigger>
                <TabsTrigger value="video">Video Post</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea rows={5} value={form.message} className="text-base"
                onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Write your post…" />
            </div>

            {form.post_type !== "text" && (
              <div className="space-y-1.5">
                <Label>Media</Label>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" className="hidden"
                    accept={form.post_type === "video" ? "video/*" : "image/*"}
                    onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                  <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-2">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
                  </Button>
                  {form.media_url && <span className="truncate text-xs text-muted-foreground">{form.media_url}</span>}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Select value={form.destination} onValueChange={(v) => setForm({ ...form, destination: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="both">Both</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Schedule (optional)</Label>
                <Input type="datetime-local" value={form.scheduled_at} className="text-base"
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
              </div>
              {form.destination !== "instagram" && (
                <div className="space-y-1.5">
                  <Label>Facebook Page</Label>
                  <Select value={form.page_id} onValueChange={(v) => setForm({ ...form, page_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select page" /></SelectTrigger>
                    <SelectContent>{pages.map((p) => <SelectItem key={p.page_id} value={p.page_id}>{p.page_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {form.destination !== "facebook" && (
                <div className="space-y-1.5">
                  <Label>Instagram Account</Label>
                  <Select value={form.instagram_id} onValueChange={(v) => setForm({ ...form, instagram_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {igOptions.map((p) => <SelectItem key={p.instagram_id} value={p.instagram_id}>@{p.instagram_username || p.instagram_id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => submit(false)} disabled={publishing}>
                {form.scheduled_at ? "Schedule" : "Save Draft"}
              </Button>
              <Button onClick={() => submit(true)} disabled={publishing} className="gap-2">
                {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Publish
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-xl border p-4">
              <div className="mb-3 flex items-center gap-2">
                {form.destination === "instagram"
                  ? <Instagram className="h-5 w-5 text-muted-foreground" />
                  : <Facebook className="h-5 w-5 text-muted-foreground" />}
                <span className="text-sm font-medium">
                  {form.destination === "instagram"
                    ? `@${igOptions.find((p) => p.instagram_id === form.instagram_id)?.instagram_username || "your account"}`
                    : pages.find((p) => p.page_id === form.page_id)?.page_name || "Your Page"}
                </span>
              </div>
              {form.media_url && (
                form.post_type === "video"
                  ? <video src={form.media_url} controls className="mb-3 w-full rounded-lg" />
                  : <img src={form.media_url} alt="Post preview" className="mb-3 w-full rounded-lg" loading="lazy" />
              )}
              <p className="whitespace-pre-wrap text-sm">{form.message || "Your post text will appear here."}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-xl">
        <CardHeader><CardTitle>Post History</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {loading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)
            : posts.length === 0 ? <p className="py-6 text-center text-muted-foreground">No posts yet.</p>
            : posts.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
                <Badge variant="outline" className="capitalize">{p.post_type}</Badge>
                <span className="capitalize text-muted-foreground">{p.destination}</span>
                <span className="flex-1 truncate">{p.message || "—"}</span>
                <Badge variant={p.status === "published" ? "default" : p.status === "failed" ? "destructive" : "secondary"} className="capitalize">
                  {p.status}
                </Badge>
                {p.facebook_post_id && <span className="font-mono text-xs text-muted-foreground">{p.facebook_post_id}</span>}
              </div>
            ))}
        </CardContent>
      </Card>
    </div>
  );
}