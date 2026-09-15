import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { Package, Plus, Search, Building2, AlertTriangle } from "lucide-react";
import { AssetFormDialog } from "@/components/assets/AssetFormDialog";
import { VendorFormDialog } from "@/components/assets/VendorFormDialog";
import { IssueFormDialog } from "@/components/assets/IssueFormDialog";
import { AssetDetailSheet } from "@/components/assets/AssetDetailSheet";

const Assets = () => {
  const [search, setSearch] = useState("");
  const [assetFormOpen, setAssetFormOpen] = useState(false);
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [issueFormOpen, setIssueFormOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: assets = [] } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assets")
        .select("*, vendor:vendors!assets_vendor_id_fkey(name), amc_vendor:vendors!assets_amc_vendor_id_fkey(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: issues = [] } = useQuery({
    queryKey: ["asset-issues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("asset_issues")
        .select("*, asset:assets(name, asset_code), vendor:vendors(name)")
        .order("reported_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const filteredAssets = assets.filter((a: any) =>
    `${a.name} ${a.asset_code} ${a.category} ${a.manufacturer}`.toLowerCase().includes(search.toLowerCase())
  );

  const filteredVendors = vendors.filter((v: any) =>
    `${v.name} ${v.contact_person} ${v.category}`.toLowerCase().includes(search.toLowerCase())
  );

  const isWarrantyActive = (endDate: string | null) => endDate ? new Date(endDate) > new Date() : false;
  const isAmcActive = (endDate: string | null) => endDate ? new Date(endDate) > new Date() : false;

  const statusColors: Record<string, string> = {
    Active: "bg-success/10 text-success",
    "Under Repair": "bg-warning/10 text-warning",
    Retired: "bg-muted text-muted-foreground",
    Disposed: "bg-destructive/10 text-destructive",
  };

  const priorityColors: Record<string, string> = {
    Low: "bg-muted text-muted-foreground",
    Medium: "bg-warning/10 text-warning",
    High: "bg-destructive/10 text-destructive",
    Critical: "bg-destructive text-destructive-foreground",
  };

  const issueStatusColors: Record<string, string> = {
    Open: "bg-destructive/10 text-destructive",
    "In Progress": "bg-warning/10 text-warning",
    Resolved: "bg-success/10 text-success",
    Closed: "bg-muted text-muted-foreground",
  };

  const openIssuesCount = issues.filter((i: any) => i.status === "Open" || i.status === "In Progress").length;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2 text-xl md:text-2xl">
          <Package className="h-5 w-5 md:h-6 md:w-6" /> Asset Management
        </h1>
        <p className="text-xs md:text-sm text-muted-foreground mt-1">
          Track assets, vendors, warranties & issues
        </p>
      </div>

      <Tabs defaultValue="assets" className="mt-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
            <TabsList className="w-max">
              <TabsTrigger value="assets" className="gap-1 text-xs md:text-sm">
                <Package className="h-3.5 w-3.5" /> Assets ({assets.length})
              </TabsTrigger>
              <TabsTrigger value="vendors" className="gap-1 text-xs md:text-sm">
                <Building2 className="h-3.5 w-3.5" /> Vendors ({vendors.length})
              </TabsTrigger>
              <TabsTrigger value="issues" className="gap-1 text-xs md:text-sm">
                <AlertTriangle className="h-3.5 w-3.5" /> Issues ({openIssuesCount})
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9" />
          </div>
        </div>

        <TabsContent value="assets">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => setAssetFormOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Asset
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
            <div className="stat-card p-3 md:p-4">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl md:text-2xl font-display font-bold mt-1">{assets.length}</p>
            </div>
            <div className="stat-card p-3 md:p-4">
              <p className="text-xs text-muted-foreground">In Warranty</p>
              <p className="text-xl md:text-2xl font-display font-bold text-success mt-1">
                {assets.filter((a: any) => isWarrantyActive(a.warranty_end_date)).length}
              </p>
            </div>
            <div className="stat-card p-3 md:p-4">
              <p className="text-xs text-muted-foreground">Active AMC</p>
              <p className="text-xl md:text-2xl font-display font-bold text-primary mt-1">
                {assets.filter((a: any) => isAmcActive(a.amc_end_date)).length}
              </p>
            </div>
            <div className="stat-card p-3 md:p-4">
              <p className="text-xs text-muted-foreground">Open Issues</p>
              <p className="text-xl md:text-2xl font-display font-bold text-destructive mt-1">{openIssuesCount}</p>
            </div>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {filteredAssets.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No assets found</div>
            ) : filteredAssets.map((asset: any) => (
              <div
                key={asset.id}
                className="stat-card p-3 cursor-pointer active:scale-[0.98] transition-transform"
                onClick={() => { setSelectedAsset(asset); setDetailOpen(true); }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{asset.name}</p>
                    <p className="text-xs text-muted-foreground">{asset.asset_code || asset.serial_number || "—"}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <Badge variant="outline" className="text-[10px]">{asset.category}</Badge>
                      {asset.warranty_end_date && (
                        <Badge className={`text-[10px] ${isWarrantyActive(asset.warranty_end_date) ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                          W: {isWarrantyActive(asset.warranty_end_date) ? "Active" : "Expired"}
                        </Badge>
                      )}
                      {asset.amc_end_date && (
                        <Badge className={`text-[10px] ${isAmcActive(asset.amc_end_date) ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                          AMC: {isAmcActive(asset.amc_end_date) ? "Active" : "Expired"}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusColors[asset.status] || ""}`}>
                    {asset.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden md:block data-table">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Asset</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Category</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Vendor</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Warranty</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">AMC</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAssets.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No assets found</td></tr>
                ) : filteredAssets.map((asset: any) => (
                  <tr key={asset.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => { setSelectedAsset(asset); setDetailOpen(true); }}>
                    <td className="p-4">
                      <p className="font-medium text-sm">{asset.name}</p>
                      <p className="text-xs text-muted-foreground">{asset.asset_code || asset.serial_number || "—"}</p>
                    </td>
                    <td className="p-4"><Badge variant="outline" className="text-xs">{asset.category}</Badge></td>
                    <td className="p-4 text-sm text-muted-foreground">{asset.vendor?.name || "—"}</td>
                    <td className="p-4">
                      {asset.warranty_end_date ? (
                        <Badge className={`text-[10px] ${isWarrantyActive(asset.warranty_end_date) ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                          {isWarrantyActive(asset.warranty_end_date) ? "Active" : "Expired"}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="p-4">
                      {asset.amc_end_date ? (
                        <Badge className={`text-[10px] ${isAmcActive(asset.amc_end_date) ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                          {isAmcActive(asset.amc_end_date) ? "Active" : "Expired"}
                        </Badge>
                      ) : <span className="text-xs text-muted-foreground">—</span>}
                    </td>
                    <td className="p-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColors[asset.status] || ""}`}>{asset.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </TabsContent>

        <TabsContent value="vendors">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => setVendorFormOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Vendor
            </Button>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {filteredVendors.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No vendors found</div>
            ) : filteredVendors.map((v: any) => (
              <div key={v.id} className="stat-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{v.name}</p>
                    {v.contact_person && <p className="text-xs text-muted-foreground">{v.contact_person}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                      {v.phone && <span>{v.phone}</span>}
                      {v.city && <span>{v.city}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {v.category && <Badge variant="outline" className="text-[10px]">{v.category}</Badge>}
                    <Badge className={`text-[10px] ${v.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {v.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden md:block data-table">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Vendor</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Contact</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Phone</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">City</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Category</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredVendors.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No vendors found</td></tr>
                ) : filteredVendors.map((v: any) => (
                  <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-4 font-medium text-sm">{v.name}</td>
                    <td className="p-4 text-sm text-muted-foreground">{v.contact_person || "—"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{v.phone || "—"}</td>
                    <td className="p-4 text-sm text-muted-foreground">{v.city || "—"}</td>
                    <td className="p-4"><Badge variant="outline" className="text-xs">{v.category}</Badge></td>
                    <td className="p-4">
                      <Badge className={`text-[10px] ${v.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                        {v.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </TabsContent>

        <TabsContent value="issues">
          <div className="flex justify-end mb-4">
            <Button size="sm" className="gap-1.5" onClick={() => setIssueFormOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Report Issue
            </Button>
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {issues.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No issues reported</div>
            ) : issues.map((issue: any) => (
              <div key={issue.id} className="stat-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{issue.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{issue.asset?.name || "—"}</p>
                    {issue.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{issue.description}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${priorityColors[issue.priority] || ""}`}>{issue.priority}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${issueStatusColors[issue.status] || ""}`}>{issue.status}</span>
                    {issue.cost > 0 && <span className="text-xs font-medium">₹{Number(issue.cost).toLocaleString()}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hidden md:block data-table">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Issue</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Asset</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Priority</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Reported</th>
                  <th className="text-left text-xs font-medium text-muted-foreground p-4">Vendor</th>
                  <th className="text-right text-xs font-medium text-muted-foreground p-4">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {issues.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">No issues reported</td></tr>
                ) : issues.map((issue: any) => (
                  <tr key={issue.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-4">
                      <p className="font-medium text-sm">{issue.title}</p>
                      {issue.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{issue.description}</p>}
                    </td>
                    <td className="p-4 text-sm">{issue.asset?.name || "—"}</td>
                    <td className="p-4"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${priorityColors[issue.priority] || ""}`}>{issue.priority}</span></td>
                    <td className="p-4"><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${issueStatusColors[issue.status] || ""}`}>{issue.status}</span></td>
                    <td className="p-4 text-sm text-muted-foreground">{new Date(issue.reported_date).toLocaleDateString()}</td>
                    <td className="p-4 text-sm text-muted-foreground">{issue.vendor?.name || "—"}</td>
                    <td className="p-4 text-right text-sm font-medium">{issue.cost > 0 ? `₹${Number(issue.cost).toLocaleString()}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </TabsContent>
      </Tabs>

      <AssetFormDialog open={assetFormOpen} onOpenChange={setAssetFormOpen} vendors={vendors} />
      <VendorFormDialog open={vendorFormOpen} onOpenChange={setVendorFormOpen} />
      <IssueFormDialog open={issueFormOpen} onOpenChange={setIssueFormOpen} assets={assets} vendors={vendors} />
      {selectedAsset && (
        <AssetDetailSheet open={detailOpen} onOpenChange={setDetailOpen} asset={selectedAsset} vendors={vendors} />
      )}
    </div>
  );
};

export default Assets;
