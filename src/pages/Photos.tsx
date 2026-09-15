import { useState, useRef } from "react";
import { Plus, Camera, Image, Trash2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAll } from "@/lib/supabasePaginate";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { useModuleListViews } from "@/hooks/useModuleListViews";
import ViewBar from "@/components/listViews/ViewBar";
import ViewEditorDialog, { type PickOption } from "@/components/listViews/ViewEditorDialog";
import ViewFiltersPanel from "@/components/listViews/ViewFiltersPanel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { applyFilters as applyListFilters, type ListView } from "@/lib/listViews/engine";
import { PHOTO_VIEW_FIELDS, DEFAULT_PHOTO_VIEW_COLUMNS } from "@/lib/listViews/photoFields";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const Photos = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    allViews, userId: viewsUserId, activeView, selectView, saveView, deleteView, pinDefault,
  } = useModuleListViews("photos", "Photos", DEFAULT_PHOTO_VIEW_COLUMNS);
  const [viewEditorOpen, setViewEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<ListView | null>(null);
  const [deleteViewTarget, setDeleteViewTarget] = useState<ListView | null>(null);
  const [viewFiltersOpen, setViewFiltersOpen] = useState(false);

  // Form state
  const [patientId, setPatientId] = useState("");
  const [appointmentId, setAppointmentId] = useState("");
  const [procedureId, setProcedureId] = useState("");
  const [photoType, setPhotoType] = useState<"before" | "after">("before");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const { data: photos = [], isLoading } = useQuery({
    queryKey: ["patient-photos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patient_photos")
        .select("*, patients(first_name, last_name), procedures(service_name)")
        .order("taken_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: patients = [] } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => {
      return await fetchAll<any>((from, to) =>
        supabase
          .from("patients")
          .select("id, first_name, last_name")
          .order("first_name")
          .range(from, to)
      );
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, auth_user_id").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  // Saved-view filter builder options for the picklist fields
  const viewOptionsFor = (source?: string): PickOption[] => {
    switch (source) {
      case "photo_type": return [{ value: "before", label: "Before" }, { value: "after", label: "After" }];
      default: return [];
    }
  };

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("appointments").select("id, patient_name, service, start_time").order("start_time", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: procedures = [] } = useQuery({
    queryKey: ["procedures-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("procedures").select("id, service_name, procedure_date, patients(first_name, last_name)").order("procedure_date", { ascending: false }).limit(50);
      if (error) throw error;
      return data;
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadPhoto = useMutation({
    mutationFn: async () => {
      if (!selectedFile || !patientId) throw new Error("Select a patient and photo");

      const ext = selectedFile.name.split(".").pop();
      const fileName = `${patientId}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("patient-photos")
        .upload(fileName, selectedFile);
      if (uploadError) throw uploadError;

      const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/patient-photos/${fileName}`;

      const { error } = await supabase.from("patient_photos").insert({
        patient_id: patientId,
        appointment_id: appointmentId || null,
        procedure_id: procedureId || null,
        photo_type: photoType,
        photo_url: photoUrl,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-photos"] });
      toast.success("Photo uploaded successfully");
      resetForm();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deletePhoto = useMutation({
    mutationFn: async (photo: any) => {
      // Extract path from URL
      const urlParts = photo.photo_url.split("/patient-photos/");
      if (urlParts[1]) {
        await supabase.storage.from("patient-photos").remove([urlParts[1]]);
      }
      const { error } = await supabase.from("patient_photos").delete().eq("id", photo.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-photos"] });
      toast.success("Photo deleted");
      setViewPhoto(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetForm = () => {
    setPatientId("");
    setAppointmentId("");
    setProcedureId("");
    setPhotoType("before");
    setNotes("");
    setSelectedFile(null);
    setPreview(null);
  };

  const filtered = photos.filter((p: any) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = `${p.patients?.first_name || ""} ${p.patients?.last_name || ""}`.toLowerCase();
    const d = p.taken_at ? new Date(p.taken_at) : null;
    const dateTokens = d
      ? [
          d.toLocaleDateString("en-GB"),
          d.toLocaleDateString("en-US"),
          d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          d.toISOString().slice(0, 10),
          String(d.getFullYear()),
        ]
          .join(" ")
          .toLowerCase()
      : "";
    return (
      name.includes(q) ||
      (p.notes || "").toLowerCase().includes(q) ||
      (p.procedures?.service_name || "").toLowerCase().includes(q) ||
      dateTokens.includes(q)
    );
  });

  // Denormalize a photo into the flat shape PHOTO_VIEW_FIELDS' filter engine reads
  const toViewRow = (p: any) => ({
    id: p.id,
    patient: `${p.patients?.first_name || ""} ${p.patients?.last_name || ""}`.trim(),
    photo_type: p.photo_type || "",
    procedure: p.procedures?.service_name || "",
    notes: p.notes || "",
    taken_at: p.taken_at,
  });

  // Apply the active saved view's filters (if any)
  const viewFiltered = (() => {
    if (!activeView?.filters?.conditions?.length) return filtered;
    const denormalized = filtered.map(toViewRow);
    const kept = new Set(applyListFilters(denormalized, activeView.filters, PHOTO_VIEW_FIELDS).map((r) => r.id));
    return filtered.filter((p: any) => kept.has(p.id));
  })();

  // Group photos by patient for before/after comparison
  const groupedByPatient = viewFiltered.reduce((acc: Record<string, any[]>, photo: any) => {
    const key = photo.patient_id;
    if (!acc[key]) acc[key] = [];
    acc[key].push(photo);
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Patient Photos</h1>
          <p className="page-subtitle">Before & after documentation linked to patients and procedures</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 w-fit"><Camera className="h-4 w-4" /> Upload Photo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display">Upload Patient Photo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Patient *</Label>
                <PatientCombobox
                  value={patientId}
                  onValueChange={setPatientId}
                  placeholder="Select patient"
                  className="mt-1.5"
                />
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label>Linked Procedure</Label>
                  <Select value={procedureId} onValueChange={setProcedureId}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      {procedures.map((pr: any) => (
                        <SelectItem key={pr.id} value={pr.id}>
                          {pr.service_name} — {pr.patients?.first_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Linked Appointment</Label>
                <Select value={appointmentId} onValueChange={setAppointmentId}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>
                    {appointments.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.patient_name} — {a.service}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* File upload */}
              <div>
                <Label>Photo *</Label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                {preview ? (
                  <div className="mt-1.5 relative">
                    <img src={preview} alt="Preview" className="w-full h-48 object-cover rounded-lg border" />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="absolute bottom-2 right-2 text-xs"
                      onClick={() => { setSelectedFile(null); setPreview(null); }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div
                    className="mt-1.5 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Image className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Click to select a photo</p>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 10MB</p>
                  </div>
                )}
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea className="mt-1.5" placeholder="Observations, area treated..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              <Button className="w-full" onClick={() => uploadPhoto.mutate()} disabled={!patientId || !selectedFile || uploadPhoto.isPending}>
                {uploadPhoto.isPending ? "Uploading..." : "Upload Photo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <ViewBar
          views={allViews}
          activeView={activeView}
          currentUserId={viewsUserId}
          onSelect={selectView}
          onNew={() => { setEditingView(null); setViewEditorOpen(true); }}
          onEdit={(v) => { setEditingView(v); setViewEditorOpen(true); }}
          onDelete={(v) => setDeleteViewTarget(v)}
          onPin={pinDefault}
          onClone={(v) => { setEditingView({ ...v, id: undefined as any, name: `${v.name} (Copy)`, is_default: false }); setViewEditorOpen(true); }}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["patient-photos"] })}
          display="cards"
          onDisplayChange={() => {}}
          displayModes={["cards"]}
          count={viewFiltered.length}
          search={search}
          onSearchChange={setSearch}
          itemLabel="Photos"
          filtersOpen={viewFiltersOpen}
          onToggleFilters={() => setViewFiltersOpen((o) => !o)}
        />
      </div>

      {viewFiltersOpen && (
        <Sheet open onOpenChange={(o) => { if (!o) setViewFiltersOpen(false); }}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-md">
            <ViewFiltersPanel
              view={activeView}
              canManage={!!activeView && !activeView.is_standard && activeView.owner_id === viewsUserId}
              fields={PHOTO_VIEW_FIELDS}
              optionsFor={viewOptionsFor}
              onSave={(filters) => { if (activeView) saveView({ ...activeView, filters }); }}
              onClose={() => setViewFiltersOpen(false)}
              itemLabel="photos"
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Photo Grid */}
      {isLoading ? (
        <p className="text-center py-12 text-muted-foreground">Loading photos...</p>
      ) : viewFiltered.length === 0 ? (
        <div className="text-center py-16">
          <Camera className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No photos uploaded yet</p>
          <p className="text-sm text-muted-foreground mt-1">Upload before & after photos to track patient progress</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {viewFiltered.map((photo: any, i: number) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              className="group stat-card p-0 overflow-hidden cursor-pointer"
              onClick={() => setViewPhoto(photo)}
            >
              <div className="relative">
                <img src={photo.photo_url} alt="" className="w-full h-48 object-cover" loading="lazy" />
              </div>
              <div className="p-3">
                <p className="font-medium text-sm truncate">{photo.patients?.first_name} {photo.patients?.last_name}</p>
                {photo.procedures?.service_name && (
                  <p className="text-xs text-muted-foreground truncate">{photo.procedures.service_name}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">{new Date(photo.taken_at).toLocaleDateString()}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* View Photo Dialog */}
      <Dialog open={!!viewPhoto} onOpenChange={(o) => { if (!o) setViewPhoto(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Photo Details</DialogTitle>
          </DialogHeader>
          {viewPhoto && (
            <div className="space-y-4">
              <img src={viewPhoto.photo_url} alt="" className="w-full max-h-[60vh] object-contain rounded-lg bg-muted" />
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium">{viewPhoto.patients?.first_name} {viewPhoto.patients?.last_name}</span>
                <span className="text-xs text-muted-foreground">• {new Date(viewPhoto.taken_at).toLocaleDateString()}</span>
              </div>
              {viewPhoto.procedures?.service_name && (
                <p className="text-sm text-muted-foreground">Procedure: <span className="text-foreground">{viewPhoto.procedures.service_name}</span></p>
              )}
              {viewPhoto.notes && (
                <div className="bg-muted/50 rounded-md p-3 text-sm">{viewPhoto.notes}</div>
              )}
              <div className="flex justify-end">
                <Button variant="destructive" size="sm" className="gap-1" onClick={() => deletePhoto.mutate(viewPhoto)} disabled={deletePhoto.isPending}>
                  <Trash2 className="h-3.5 w-3.5" /> {deletePhoto.isPending ? "Deleting..." : "Delete Photo"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ViewEditorDialog
        open={viewEditorOpen}
        onOpenChange={setViewEditorOpen}
        view={editingView}
        onSave={saveView}
        fields={PHOTO_VIEW_FIELDS}
        defaultColumns={DEFAULT_PHOTO_VIEW_COLUMNS}
        optionsFor={viewOptionsFor}
        people={staffList
          .filter((s: any) => s.auth_user_id)
          .map((s: any) => ({ value: s.auth_user_id, label: `${s.first_name || ""} ${s.last_name || ""}`.trim() }))}
        itemLabel="photos"
      />

      <AlertDialog open={!!deleteViewTarget} onOpenChange={(o) => { if (!o) setDeleteViewTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteViewTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This list view will be removed for everyone it is shared with.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteViewTarget) deleteView(deleteViewTarget);
                setDeleteViewTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Photos;
