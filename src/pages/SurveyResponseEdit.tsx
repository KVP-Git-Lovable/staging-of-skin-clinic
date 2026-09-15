import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Pill, Stethoscope, Loader2, Plus, Trash2, Search, Save, User, FileText } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface RecProduct {
  product_id?: string | null;
  product_name?: string;
  name?: string;
  advice?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  quantity?: number;
}

interface RecService {
  service_id?: string | null;
  service_name?: string;
  name?: string;
  advice?: string;
}

export default function SurveyResponseEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [products, setProducts] = useState<RecProduct[]>([]);
  const [services, setServices] = useState<RecService[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: response, isLoading } = useQuery({
    queryKey: ["survey-response-edit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_responses")
        .select("*, survey_templates(name), patients(id, first_name, last_name, phone)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: productCatalog = [] } = useQuery({
    queryKey: ["pharma-products-list"],
    queryFn: async () => {
      const { data } = await supabase.from("pharma_products").select("id, name").order("name");
      return data || [];
    },
  });

  const { data: serviceCatalog = [] } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("id, name").order("name");
      return data || [];
    },
  });

  // Initialize from response: prefer selected_* if set, otherwise ai_*
  useEffect(() => {
    if (!response) return;
    const sp = (response.selected_products as RecProduct[]) || [];
    const ss = (response.selected_services as RecService[]) || [];
    const ap = (response.ai_products as RecProduct[]) || [];
    const as = (response.ai_services as RecService[]) || [];
    setProducts(sp.length > 0 ? sp : ap);
    setServices(ss.length > 0 ? ss : as);
  }, [response]);

  const addProduct = (productId: string, name: string) => {
    if (products.some((p) => p.product_id === productId)) return;
    setProducts([...products, { product_id: productId, product_name: name, advice: "", dosage: "", frequency: "", duration: "", instructions: "" }]);
    setProductSearch("");
  };

  const addService = (serviceId: string, name: string) => {
    if (services.some((s) => s.service_id === serviceId)) return;
    setServices([...services, { service_id: serviceId, service_name: name, advice: "" }]);
    setServiceSearch("");
  };

  const updateProduct = (i: number, field: keyof RecProduct, value: any) => {
    const updated = [...products];
    (updated[i] as any)[field] = value;
    setProducts(updated);
  };

  const updateService = (i: number, field: keyof RecService, value: any) => {
    const updated = [...services];
    (updated[i] as any)[field] = value;
    setServices(updated);
  };

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("survey_responses")
        .update({
          selected_products: products as any,
          selected_services: services as any,
          updated_by: (await supabase.auth.getUser()).data.user?.id || null,
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Survey response updated");
      queryClient.invalidateQueries({ queryKey: ["all-survey-responses"] });
      queryClient.invalidateQueries({ queryKey: ["survey-response-detail", id] });
      navigate(`/surveys/${id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!response) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Survey response not found.</p>
      </div>
    );
  }

  const patient = response.patients as any;
  const template = response.survey_templates as any;

  const filteredProducts = productCatalog.filter(
    (p: any) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) &&
      !products.some((tp) => tp.product_id === p.id)
  );

  const filteredServices = serviceCatalog.filter(
    (s: any) =>
      s.name.toLowerCase().includes(serviceSearch.toLowerCase()) &&
      !services.some((ts) => ts.service_id === s.id)
  );

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold">Edit Survey Response</h1>
        <p className="text-sm text-muted-foreground">Add or remove recommended products and services</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-primary" /> Patient
          </div>
          {patient ? (
            <div className="space-y-1 text-sm">
              <Link to={`/patients/${patient.id}`} className="text-primary hover:underline font-medium">
                {patient.first_name} {patient.last_name}
              </Link>
              {patient.phone && <p className="text-muted-foreground text-xs">{patient.phone}</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </Card>
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" /> Template
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{template?.name || "—"}</p>
            <p className="text-muted-foreground text-xs">
              {format(new Date(response.created_at), "dd MMM yyyy, hh:mm a")}
            </p>
          </div>
        </Card>
      </div>

      {/* Products */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Pill className="h-4 w-4 text-primary" />
          Recommended Products
          <Badge variant="outline" className="text-[10px]">{products.length}</Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search products to add..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {productSearch && filteredProducts.length > 0 && (
          <div className="border rounded-lg max-h-40 overflow-y-auto">
            {filteredProducts.slice(0, 10).map((p: any) => (
              <button
                key={p.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                onClick={() => addProduct(p.id, p.name)}
              >
                <Plus className="h-3 w-3" /> {p.name}
              </button>
            ))}
          </div>
        )}

        {products.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No products. Search above to add.</p>
        ) : (
          <div className="space-y-3">
            {products.map((p, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{p.product_name || p.name || "Product"}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => setProducts(products.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  value={p.advice || ""}
                  onChange={(e) => updateProduct(i, "advice", e.target.value)}
                  placeholder="Advice text..."
                  className="h-8 text-xs"
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Dosage</Label>
                    <Input value={p.dosage || ""} onChange={(e) => updateProduct(i, "dosage", e.target.value)} placeholder="e.g. 1 tablet" className="mt-1 h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Frequency</Label>
                    <Input value={p.frequency || ""} onChange={(e) => updateProduct(i, "frequency", e.target.value)} placeholder="e.g. Twice daily" className="mt-1 h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Duration</Label>
                    <Input value={p.duration || ""} onChange={(e) => updateProduct(i, "duration", e.target.value)} placeholder="e.g. 7 days" className="mt-1 h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Special Instructions</Label>
                    <Input value={p.instructions || ""} onChange={(e) => updateProduct(i, "instructions", e.target.value)} placeholder="e.g. After meals" className="mt-1 h-8 text-xs" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Services */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Stethoscope className="h-4 w-4 text-primary" />
          Recommended Services
          <Badge variant="outline" className="text-[10px]">{services.length}</Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search services to add..."
            value={serviceSearch}
            onChange={(e) => setServiceSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {serviceSearch && filteredServices.length > 0 && (
          <div className="border rounded-lg max-h-40 overflow-y-auto">
            {filteredServices.slice(0, 10).map((s: any) => (
              <button
                key={s.id}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                onClick={() => addService(s.id, s.name)}
              >
                <Plus className="h-3 w-3" /> {s.name}
              </button>
            ))}
          </div>
        )}

        {services.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No services. Search above to add.</p>
        ) : (
          <div className="space-y-3">
            {services.map((s, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{s.service_name || s.name || "Service"}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    onClick={() => setServices(services.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  value={s.advice || ""}
                  onChange={(e) => updateService(i, "advice", e.target.value)}
                  placeholder="Advice text..."
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
