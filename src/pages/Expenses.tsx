import { formatMoney } from "@/lib/currency";
import { useState, useEffect, useCallback } from "react";
import { VendorCombobox } from "@/components/shared/VendorCombobox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, Search, Upload, Loader2, Trash2, Edit, Eye, Receipt,
  FileText, IndianRupee, Filter, X, Sparkles, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";

const paymentModes = ["Cash", "Card", "UPI", "Bank Transfer", "Cheque"];

interface ExpenseCategory {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface Expense {
  id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  amount: number;
  expense_date: string;
  payment_mode: string | null;
  vendor_name: string | null;
  reference_number: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  expense_categories?: ExpenseCategory | null;
}

const emptyExpense = {
  title: "", description: "", amount: 0, expense_date: format(new Date(), "yyyy-MM-dd"),
  payment_mode: "Cash", vendor_name: "", reference_number: "", notes: "", category_id: "",
};

const Expenses = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMonth, setFilterMonth] = useState(format(new Date(), "yyyy-MM"));
  const [showExpenseDialog, setShowExpenseDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showDetailSheet, setShowDetailSheet] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [editingExpense, setEditingExpense] = useState<any>(emptyExpense);
  const [isEditing, setIsEditing] = useState(false);
  const [newCategory, setNewCategory] = useState({ name: "", description: "" });
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  // Queries
  const { data: categories = [] } = useQuery({
    queryKey: ["expense_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").order("name");
      if (error) throw error;
      return data as ExpenseCategory[];
    },
  });

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ["expenses", filterMonth, filterCategory, search],
    queryFn: async () => {
      let query = supabase.from("expenses").select("*, expense_categories(*)").order("expense_date", { ascending: false });

      if (filterMonth) {
        const start = `${filterMonth}-01`;
        const endDate = new Date(parseInt(filterMonth.split("-")[0]), parseInt(filterMonth.split("-")[1]), 0);
        query = query.gte("expense_date", start).lte("expense_date", format(endDate, "yyyy-MM-dd"));
      }
      if (filterCategory && filterCategory !== "all") {
        query = query.eq("category_id", filterCategory);
      }
      if (search) {
        query = query.or(`title.ilike.%${search}%,vendor_name.ilike.%${search}%,reference_number.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Expense[];
    },
  });

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);

  // Mutations
  const createCategory = useMutation({
    mutationFn: async (cat: { name: string; description: string }) => {
      const { data, error } = await supabase.from("expense_categories").insert({ name: cat.name, description: cat.description || null }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["expense_categories"] });
      toast.success(`Category "${data.name}" created`);
      setNewCategory({ name: "", description: "" });
      setShowCategoryDialog(false);
      // Auto-select newly created category in expense form
      setEditingExpense((prev: any) => ({ ...prev, category_id: data.id }));
    },
    onError: (e: any) => toast.error(e.message || "Failed to create category"),
  });

  const saveExpense = useMutation({
    mutationFn: async (exp: any) => {
      const payload = {
        title: exp.title,
        description: exp.description || null,
        amount: Number(exp.amount),
        expense_date: exp.expense_date,
        payment_mode: exp.payment_mode || "Cash",
        vendor_name: exp.vendor_name || null,
        reference_number: exp.reference_number || null,
        notes: exp.notes || null,
        category_id: exp.category_id || null,
        attachment_url: exp.attachment_url || null,
        attachment_name: exp.attachment_name || null,
      };
      if (exp.id) {
        const { data, error } = await supabase.from("expenses").update(payload).eq("id", exp.id).select("*, expense_categories(*)").single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase.from("expenses").insert(payload).select("*, expense_categories(*)").single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success(isEditing ? "Expense updated" : "Expense added");
      setShowExpenseDialog(false);
      setAttachmentFile(null);
    },
    onError: (e: any) => toast.error(e.message || "Failed to save expense"),
  });

  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      const error: any = await moveToTrash("expenses", id).then(() => null).catch((e: any) => e);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted");
      setShowDetailSheet(false);
    },
  });

  // File upload
  const uploadAttachment = async (file: File): Promise<{ url: string; name: string }> => {
    const ext = file.name.split(".").pop();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("expense-attachments").upload(path, file);
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("expense-attachments").getPublicUrl(path);
    return { url: urlData.publicUrl, name: file.name };
  };

  // Parse attachment with AI
  const parseAttachment = async (imageUrl: string) => {
    setParsing(true);
    try {
      const resp = await supabase.functions.invoke("parse-expense", {
        body: { imageUrl },
      });
      if (resp.error) throw resp.error;
      const parsed = resp.data;

      // Auto-fill form fields from parsed data
      setEditingExpense((prev: any) => ({
        ...prev,
        title: parsed.title || prev.title,
        amount: parsed.amount || prev.amount,
        expense_date: parsed.expense_date || prev.expense_date,
        vendor_name: parsed.vendor_name || prev.vendor_name,
        reference_number: parsed.reference_number || prev.reference_number,
        notes: parsed.notes || prev.notes,
        payment_mode: parsed.payment_mode || prev.payment_mode,
      }));

      // Try to match category suggestion
      if (parsed.category_suggestion) {
        const match = categories.find(c => c.name.toLowerCase() === parsed.category_suggestion.toLowerCase());
        if (match) {
          setEditingExpense((prev: any) => ({ ...prev, category_id: match.id }));
        } else {
          // Suggest creating the category
          toast.info(`Suggested category "${parsed.category_suggestion}" not found. You can create it.`, { duration: 5000 });
          setNewCategory({ name: parsed.category_suggestion, description: "" });
        }
      }

      toast.success("Receipt parsed! Please review the auto-filled details.");
    } catch (e: any) {
      console.error(e);
      toast.error("Could not parse attachment. Please fill details manually.");
    } finally {
      setParsing(false);
    }
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachmentFile(file);
    setUploading(true);
    try {
      const { url, name } = await uploadAttachment(file);
      setEditingExpense((prev: any) => ({ ...prev, attachment_url: url, attachment_name: name }));
      toast.success("File uploaded");

      // If it's an image, offer to parse it
      if (file.type.startsWith("image/") || file.type === "application/pdf") {
        await parseAttachment(url);
      }
    } catch (err: any) {
      toast.error("Upload failed: " + (err.message || "Unknown error"));
    } finally {
      setUploading(false);
    }
  };

  const openNewExpense = () => {
    setEditingExpense({ ...emptyExpense });
    setIsEditing(false);
    setAttachmentFile(null);
    setShowExpenseDialog(true);
  };

  const openEditExpense = (exp: Expense) => {
    setEditingExpense({
      id: exp.id,
      title: exp.title,
      description: exp.description || "",
      amount: exp.amount,
      expense_date: exp.expense_date,
      payment_mode: exp.payment_mode || "Cash",
      vendor_name: exp.vendor_name || "",
      reference_number: exp.reference_number || "",
      notes: exp.notes || "",
      category_id: exp.category_id || "",
      attachment_url: exp.attachment_url || "",
      attachment_name: exp.attachment_name || "",
    });
    setIsEditing(true);
    setShowExpenseDialog(true);
    setShowDetailSheet(false);
  };

  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c.name]));

  // Summary by category
  const categoryTotals = expenses.reduce<Record<string, number>>((acc, e) => {
    const catName = e.category_id ? (categoryMap[e.category_id] || "Uncategorized") : "Uncategorized";
    acc[catName] = (acc[catName] || 0) + Number(e.amount);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground text-sm">Track and manage clinic expenses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCategoryDialog(true)}>
            <FileText className="h-4 w-4 mr-1" /> Manage Categories
          </Button>
          <Button size="sm" onClick={openNewExpense}>
            <Plus className="h-4 w-4 mr-1" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <IndianRupee className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total ({format(new Date(filterMonth + "-01"), "MMM yyyy")})</p>
                <p className="text-xl font-bold">{formatMoney(totalExpenses)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Entries This Month</p>
                <p className="text-xl font-bold">{expenses.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center">
                <FileText className="h-5 w-5 text-accent-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Categories</p>
                <p className="text-xl font-bold">{categories.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Input type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)} className="w-auto" />
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Expenses Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
              ) : expenses.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No expenses found</TableCell></TableRow>
              ) : (
                expenses.map(exp => (
                  <TableRow key={exp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedExpense(exp); setShowDetailSheet(true); }}>
                    <TableCell className="text-sm">{format(new Date(exp.expense_date), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{exp.title}</span>
                        {exp.attachment_url && <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      {exp.expense_categories ? (
                        <Badge variant="secondary" className="text-xs">{exp.expense_categories.name}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{exp.vendor_name || "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatMoney(Number(exp.amount))}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{exp.payment_mode || "Cash"}</Badge></TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); openEditExpense(exp); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Category-wise breakdown */}
      {Object.keys(categoryTotals).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
                <div key={cat} className="flex items-center justify-between">
                  <span className="text-sm">{cat}</span>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(total / totalExpenses) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold w-24 text-right">{formatMoney(total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expense Detail Sheet */}
      <Sheet open={showDetailSheet} onOpenChange={setShowDetailSheet}>
        <SheetContent className="w-screen max-w-none sm:max-w-none overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedExpense?.title}</SheetTitle>
            <SheetDescription>Expense details</SheetDescription>
          </SheetHeader>
          {selectedExpense && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="font-medium">{format(new Date(selectedExpense.expense_date), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Amount</p>
                  <p className="font-bold text-lg">{formatMoney(Number(selectedExpense.amount))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Category</p>
                  <p className="font-medium">{selectedExpense.expense_categories?.name || "Uncategorized"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment Mode</p>
                  <p className="font-medium">{selectedExpense.payment_mode || "Cash"}</p>
                </div>
                {selectedExpense.vendor_name && (
                  <div>
                    <p className="text-xs text-muted-foreground">Vendor</p>
                    <p className="font-medium">{selectedExpense.vendor_name}</p>
                  </div>
                )}
                {selectedExpense.reference_number && (
                  <div>
                    <p className="text-xs text-muted-foreground">Reference #</p>
                    <p className="font-medium">{selectedExpense.reference_number}</p>
                  </div>
                )}
              </div>
              {selectedExpense.description && (
                <div>
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm">{selectedExpense.description}</p>
                </div>
              )}
              {selectedExpense.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{selectedExpense.notes}</p>
                </div>
              )}
              {selectedExpense.attachment_url && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Attachment</p>
                  {selectedExpense.attachment_url.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                    <img src={selectedExpense.attachment_url} alt="Expense attachment" className="rounded-lg border max-h-60 object-contain" />
                  ) : (
                    <a href={selectedExpense.attachment_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <Download className="h-4 w-4" /> {selectedExpense.attachment_name || "View Attachment"}
                    </a>
                  )}
                </div>
              )}
              <Separator />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => openEditExpense(selectedExpense)}>
                  <Edit className="h-4 w-4 mr-1" /> Edit
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => { if (confirm("Delete this expense?")) deleteExpense.mutate(selectedExpense.id); }}>
                  <Trash2 className="h-4 w-4 mr-1" /> Delete
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add/Edit Expense Dialog */}
      <Dialog open={showExpenseDialog} onOpenChange={setShowExpenseDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? "Edit Expense" : "Add Expense"}</DialogTitle>
            <DialogDescription>
              {isEditing ? "Update expense details" : "Enter expense details or upload a receipt to auto-fill"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Attachment upload */}
            <div className="border-2 border-dashed rounded-lg p-4 text-center">
              {editingExpense.attachment_url ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-primary" />
                    <span>{editingExpense.attachment_name || "Attachment"}</span>
                  </div>
                  <div className="flex gap-1">
                    {parsing && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    <Button variant="ghost" size="sm" onClick={() => setEditingExpense((prev: any) => ({ ...prev, attachment_url: "", attachment_name: "" }))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-2">
                  {uploading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Upload Receipt / Invoice</p>
                        <p className="text-xs text-muted-foreground">AI will auto-fill expense details</p>
                      </div>
                    </>
                  )}
                  <input type="file" className="hidden" accept="image/*,.pdf" onChange={handleAttachmentChange} disabled={uploading} />
                </label>
              )}
            </div>

            {parsing && (
              <div className="flex items-center gap-2 text-sm text-primary bg-primary/5 rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing receipt with AI...</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Title *</Label>
                <Input value={editingExpense.title} onChange={e => setEditingExpense((p: any) => ({ ...p, title: e.target.value }))} placeholder="Expense title" />
              </div>
              <div>
                <Label>Amount (₹) *</Label>
                <Input type="number" value={editingExpense.amount} onChange={e => setEditingExpense((p: any) => ({ ...p, amount: e.target.value }))} />
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={editingExpense.expense_date} onChange={e => setEditingExpense((p: any) => ({ ...p, expense_date: e.target.value }))} />
              </div>
              <div>
                <Label>Category</Label>
                <div className="flex gap-1">
                  <Select value={editingExpense.category_id || "none"} onValueChange={v => setEditingExpense((p: any) => ({ ...p, category_id: v === "none" ? "" : v }))}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Category</SelectItem>
                      {categories.filter(c => c.is_active).map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" className="shrink-0" onClick={() => setShowCategoryDialog(true)} title="New Category">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Payment Mode</Label>
                <Select value={editingExpense.payment_mode} onValueChange={v => setEditingExpense((p: any) => ({ ...p, payment_mode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentModes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendor</Label>
                <VendorCombobox value={editingExpense.vendor_name || ""} onChange={v => setEditingExpense((p: any) => ({ ...p, vendor_name: v }))} placeholder="Select vendor..." />
              </div>
              <div>
                <Label>Reference #</Label>
                <Input value={editingExpense.reference_number} onChange={e => setEditingExpense((p: any) => ({ ...p, reference_number: e.target.value }))} placeholder="Invoice/Bill no." />
              </div>
              <div className="col-span-2">
                <Label>Description</Label>
                <Textarea value={editingExpense.description} onChange={e => setEditingExpense((p: any) => ({ ...p, description: e.target.value }))} rows={2} />
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Textarea value={editingExpense.notes} onChange={e => setEditingExpense((p: any) => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExpenseDialog(false)}>Cancel</Button>
            <Button onClick={() => saveExpense.mutate(editingExpense)} disabled={!editingExpense.title || !editingExpense.amount || saveExpense.isPending}>
              {saveExpense.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isEditing ? "Update" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Category Management Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Expense Categories</DialogTitle>
            <DialogDescription>Manage expense heads / categories</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Add new */}
            <div className="flex gap-2">
              <Input placeholder="New category name" value={newCategory.name} onChange={e => setNewCategory(p => ({ ...p, name: e.target.value }))} className="flex-1" />
              <Button size="sm" disabled={!newCategory.name.trim() || createCategory.isPending} onClick={() => createCategory.mutate(newCategory)}>
                {createCategory.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            {/* List */}
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {categories.map(c => (
                <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Badge variant={c.is_active ? "default" : "secondary"} className="text-xs">{c.name}</Badge>
                    {c.description && <span className="text-xs text-muted-foreground">{c.description}</span>}
                  </div>
                  <Badge variant="outline" className="text-xs">{c.is_active ? "Active" : "Inactive"}</Badge>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No categories yet. Create one above.</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Expenses;
