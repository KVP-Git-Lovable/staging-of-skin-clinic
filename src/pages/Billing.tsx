import { formatMoney, formatMoneyPrecise } from "@/lib/currency";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import { waitForInvoicePdf } from "@/lib/invoicePdfWait";
import { paymentModeForSplits, splitProblem, splitTotal, splitsFromInvoice } from "@/lib/paymentSplits";
import { visitLabel } from "@/lib/visitLabel";
import { useUrlPanel } from "@/hooks/useUrlPanel";
import { viewDatePreset } from "@/lib/viewDatePreset";
import { dateRangeFor } from "@/lib/listViews/engine";
import { seedInvoiceLines } from "@/lib/invoiceEditSeed";
import type { Json } from "@/integrations/supabase/types";
import { stockDelta } from "@/lib/pharmaStockDelta";
import { readBillingPrefill } from "@/lib/billingPrefill";
import { invoiceLineChanges } from "@/lib/invoiceLineChanges";
import { pickAppointmentForInvoice, doctorForInvoice, type LinkableAppointment } from "@/lib/appointmentForInvoice";
import { resolveInvoiceAppointmentId } from "@/lib/invoiceAppointmentLink";
import { paymentModeLabel } from "@/lib/paymentModes";
import { renderPdfToImages } from "@/lib/renderPdf";
import { PdfPreviewDialog } from "@/components/shared/PdfPreviewDialog";
import { useAuth } from "@/hooks/useAuth";
import { displayDate } from "@/lib/dateInput";
import { numVal } from "@/lib/numberInput";
import { assertWrote, NOT_YOURS_MESSAGE } from "@/lib/rowAccess";
import { useStackedTable } from "@/hooks/useStackedTable";
import { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, addMonths, isSameDay } from "date-fns";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { Search, Filter, Download, IndianRupee, Plus, FileText, CreditCard, Pill, Trash2, CalendarClock, Eye, Pencil, X, ChevronDown, Check, ChevronsUpDown, Stethoscope, MessageCircle } from "lucide-react";
import { useModuleListViews } from "@/hooks/useModuleListViews";
import ViewBar from "@/components/listViews/ViewBar";
import ViewEditorDialog, { type PickOption } from "@/components/listViews/ViewEditorDialog";
import FieldsDisplayDialog from "@/components/listViews/FieldsDisplayDialog";
import ViewFiltersPanel from "@/components/listViews/ViewFiltersPanel";
import ListKanban from "@/components/listViews/ListKanban";
import KanbanSettingsDialog from "@/components/listViews/KanbanSettingsDialog";
import { applyFilters as applyListFilters, fieldDefIn, type ListDisplayMode, type ListView } from "@/lib/listViews/engine";
import { ALL_VIEW_ID, getKanbanConfig, setKanbanConfig } from "@/lib/listViews/standardViews";
import { BILLING_VIEW_FIELDS, DEFAULT_BILLING_VIEW_COLUMNS } from "@/lib/listViews/billingFields";

// Lazy: pulls in recharts, kept out of the main bundle until a user actually opens Charts.
/** The ways the clinic takes money. "Split" is derived, never chosen here. */
const PAYMENT_MODES = ["Cash", "Card", "UPI", "Cheque", "Bank Transfer"] as const;

const ViewChartsPanel = lazy(() => import("@/components/listViews/ViewChartsPanel"));
import { AppointmentDetailSheet } from "@/components/appointments/AppointmentDetailSheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { motion } from "framer-motion";
import { StatCard } from "@/components/dashboard/StatCard";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarPopover } from "@/components/shared/CalendarPopover";
import { supabase } from "@/integrations/supabase/client";
import { hsnRateCache, invoiceLineRows, displayServices } from "@/lib/invoiceLines";
import { SystemRecordSection } from "@/components/shared/SystemRecordSection";
import { RecordOwnerField } from "@/components/shared/RecordOwnerField";
import { FieldHistorySection } from "@/components/shared/FieldHistorySection";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BILLED_BY_OPTIONS, billedByLabel } from "@/lib/billedBy";
import { invoiceCanBeSaved, invoiceFormHasContent } from "@/lib/invoiceFormState";
import { allocateInvoiceNumbers } from "@/lib/invoiceNumber";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fetchAll } from "@/lib/supabasePaginate";
import { fetchInvoicesPage, fetchInvoicesInRange, fetchInvoicesSearch, fetchInvoiceStats, fetchInvoiceById } from "@/lib/invoicesPage";
import { activeHsnCodes, hsnOptions as buildHsnOptions, liveHsn } from "@/lib/hsn";
import { withDrPrefix } from "@/lib/staffName";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { StaffCombobox } from "@/components/shared/StaffCombobox";
import { usePharmaProductUnits } from "@/hooks/usePharmaProductUnits";
import { getUomOptions, getSaleUom, findUom, toUomQty, toBaseQty, fmtQty } from "@/lib/uom";
import { OTHERS_VALUE } from "@/lib/othersOption";

const statusStyles: Record<string, string> = {
  Paid: "bg-success/10 text-success",
  Partial: "bg-warning/10 text-warning",
  Pending: "bg-destructive/10 text-destructive",
  Overdue: "bg-destructive/10 text-destructive",
  Cancelled: "bg-muted text-muted-foreground",
};

/** Money is always shown rounded to whole rupees (no decimals). */
const money = (n: number) =>
  formatMoney(Math.round(Number(n) || 0));
/** Tax rates keep their decimals (e.g. 2.5%). */
const rateLabel = (n: number) =>
  `${Math.round((Number(n) || 0) * 100) / 100}`;
/** Number input helper: 0 shows as an empty field with a "0" watermark. */

// ─── PDF Generation ───────────────────────────────
// Returns the printable invoice as a document rather than putting it
// anywhere. openInvoicePDF shows it in the preview dialog when the builder
// cannot be reached; handing back a string keeps it free of any assumption
// about tabs, which is what kept failing.
const invoicePrintableHtml = (inv: any): string => {
  const date = new Date(inv.created_at).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  const balance = Number(inv.total_amount) - Number(inv.paid_amount);
  const drName = inv.appointments?.doctors ? withDrPrefix(`${inv.appointments.doctors.first_name || ""} ${inv.appointments.doctors.last_name || ""}`) : "";

  const html = `
<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #1a1a1a; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #0d9488; padding-bottom: 20px; }
  .logo { font-size: 24px; font-weight: 700; color: #0d9488; }
  .logo span { font-size: 12px; display: block; color: #666; font-weight: 400; }
  .invoice-title { text-align: right; }
  .invoice-title h1 { font-size: 28px; color: #0d9488; text-transform: uppercase; letter-spacing: 2px; }
  .invoice-title p { font-size: 13px; color: #666; margin-top: 4px; }
  .details { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .details-block h3 { font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: 1px; margin-bottom: 6px; }
  .details-block p { font-size: 14px; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
  th { background: #f0fdfa; color: #0d9488; text-align: left; padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #0d9488; }
  td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #eee; }
  .amount-col { text-align: right; }
  .summary { display: flex; justify-content: flex-end; }
  .summary-table { width: 280px; }
  .summary-table tr td { padding: 8px 16px; font-size: 14px; border: none; }
  .summary-table tr:last-child td { font-weight: 700; font-size: 16px; border-top: 2px solid #0d9488; color: #0d9488; padding-top: 12px; }
  .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .status-Paid { background: #dcfce7; color: #16a34a; }
  .status-Partial { background: #fef3c7; color: #d97706; }
  .status-Pending { background: #fee2e2; color: #dc2626; }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">The Skin Clinic<span>Clinic Manager</span></div>
    <div class="invoice-title">
      <h1>Invoice</h1>
      <p>${inv.invoice_number}</p>
    </div>
  </div>
  <div class="details">
    <div class="details-block">
      <h3>Bill To</h3>
      <p><strong>${inv.patient_name || "Walk-in Patient"}</strong></p>
      ${drName ? `<p style="margin-top:4px;">Doctor: ${drName}</p>` : ""}
    </div>
    <div class="details-block" style="text-align:right;">
      <h3>Invoice Details</h3>
      <p>Date: ${date}</p>
      <p>Payment: ${
        Array.isArray(inv.payment_splits) && inv.payment_splits.length > 0
          ? inv.payment_splits.map((p: any) => `${p.mode}: ₹${Number(p.amount).toLocaleString("en-IN")}`).join(" | ")
          : (inv.payment_mode || "Cash")
      }</p>
      <p>Type: ${inv.payment_type || "One-time"}</p>
      <p style="margin-top:6px;"><span class="status-badge status-${inv.status}">${inv.status}</span></p>
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Item</th><th>HSN</th><th class="amount-col">Qty</th><th class="amount-col">Rate</th><th class="amount-col">Amount</th><th class="amount-col">GST %</th><th class="amount-col">Tax</th><th class="amount-col">Total</th></tr></thead>
    <tbody>
      ${(() => {
        const rows = invoiceLineRows(inv);
        const fmt = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
        const t = rows.reduce((a, r) => ({ amount: a.amount + r.amount, tax: a.tax + r.tax, total: a.total + r.total }), { amount: 0, tax: 0, total: 0 });
        const body = rows.map((r, i) =>
          `<tr><td>${i + 1}</td><td>${r.name}</td><td style="color:#999;font-size:12px;">${r.hsn || "—"}</td><td class="amount-col">${r.qty}</td><td class="amount-col">${fmt(r.price)}</td><td class="amount-col">${fmt(r.amount)}</td><td class="amount-col">${r.gst ? r.gst + "%" : "—"}</td><td class="amount-col">${fmt(r.tax)}</td><td class="amount-col">${fmt(r.total)}</td></tr>`
        ).join("");
        const footer = `<tr style="background:#f0fdfa;font-weight:700;"><td colspan="5">Total</td><td class="amount-col">${fmt(t.amount)}</td><td></td><td class="amount-col">${fmt(t.tax)}</td><td class="amount-col">${fmt(t.total)}</td></tr>`;
        return body + footer;
      })()}
    </tbody>
  </table>
  <div class="summary">
    <table class="summary-table">
      <tr><td>Total Amount</td><td class="amount-col">₹${Number(inv.total_amount).toLocaleString("en-IN")}</td></tr>
      <tr><td>Paid Amount</td><td class="amount-col">₹${Number(inv.paid_amount).toLocaleString("en-IN")}</td></tr>
      <tr><td>Payment Mode</td><td class="amount-col">${
        Array.isArray(inv.payment_splits) && inv.payment_splits.length > 0 ? "Split" : (inv.payment_mode || "Cash")
      }</td></tr>
      ${
        Array.isArray(inv.payment_splits) && inv.payment_splits.length > 0
          ? inv.payment_splits.map((p: any) => `<tr><td style="padding-left:28px;color:#666;">${p.mode}</td><td class="amount-col" style="color:#666;">₹${Number(p.amount || 0).toLocaleString("en-IN")}</td></tr>`).join("")
          : ""
      }
      <tr><td>Balance Due</td><td class="amount-col">₹${balance.toLocaleString("en-IN")}</td></tr>
    </table>
  </div>
  ${inv.notes ? `<div style="margin-top:20px;padding:12px 16px;background:#f9fafb;border-radius:8px;font-size:13px;"><strong>Notes:</strong> ${inv.notes}</div>` : ""}
  <div class="footer">
    <p>Thank you for choosing The Skin Clinic</p>
    <p style="margin-top:4px;">This is a computer-generated invoice.</p>
  </div>
</body>
</html>`;

  return html;
};

// ─── Types ────────────────────────────────────────
interface StageRow { label: string; amount: number; paid: number; }
interface PharmaLineItem {
  inventory_id: string;
  product_id: string;
  product_name: string;
  batch_number: string;
  quantity: number;
  unit_price: number;
  available: number;
  /** UOM this line is billed in (defaults to the product's selling UOM) */
  uom?: string;
  /** Units of `uom` per one base unit */
  uom_factor?: number;
}

const getDrName = (inv: any, staffById?: Map<string, any>) => {
  const d = inv.appointments?.doctors;
  if (d) {
    const full = [d.first_name, d.last_name].filter(Boolean).join(" ").trim();
    if (full) return withDrPrefix(full);
  }
  // No linked appointment (or its staff didn't resolve) - fall back to the
  // doctor assigned directly on the invoice (invoices.doctor_id).
  const s = inv.doctor_id ? staffById?.get(inv.doctor_id) : undefined;
  if (s) {
    const full = [s.first_name, s.last_name].filter(Boolean).join(" ").trim();
    if (full) return withDrPrefix(full);
  }
  return "";
};

// invoices.patient_name is denormalized at creation time; fall back to a
// live lookup by patient_id for rows that were saved without it.
const getPatientName = (inv: any, patientById?: Map<string, any>) => {
  if (inv.patient_name) return inv.patient_name;
  const p = inv.patient_id ? patientById?.get(inv.patient_id) : undefined;
  if (p) {
    const full = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
    if (full) return full;
  }
  return "";
};

const BILLING_FIELDS = [
  { value: "invoice_number", label: "Invoice #" },
  { value: "patient_name", label: "Patient" },
  { value: "total_amount", label: "Total Amount" },
  { value: "paid_amount", label: "Paid Amount" },
  { value: "status", label: "Status" },
  { value: "payment_mode", label: "Payment Mode" },
  { value: "created_at", label: "Date" },
];

const DEFAULT_BILLING_FIELDS = ["invoice_number", "patient_name", "total_amount", "status"];

const PAGE_SIZE = 50;

const Billing = () => {
  // A doctor only sees their own rows, so a doctor filter offers choices that
  // change nothing and implies data they cannot reach. Same scope the database
  // enforces, rather than a role-name test here.
  const { dataScope } = useAuth();
  const ownScopeOnly = dataScope === "own";
  const invoiceTableRef = useStackedTable<HTMLTableElement>();
  const queryClient = useQueryClient();
  const invalidateInvoices = () => {
    queryClient.invalidateQueries({ queryKey: ["invoices-page"] });
    queryClient.invalidateQueries({ queryKey: ["invoices-bounded"] });
    queryClient.invalidateQueries({ queryKey: ["invoices-search"] });
    queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
    // The appointments list's Bill Amount / Payment Mode columns. Nothing
    // invalidated this, so a bill taken here only reached that screen when its
    // query happened to refetch on remount or window focus.
    queryClient.invalidateQueries({ queryKey: ["invoices-for-appointments"] });
  };
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    allViews, userId: viewsUserId, activeView, selectView, saveView, saveCharts, deleteView, pinDefault, unpinDefault, updateStandardColumns,
  } = useModuleListViews("billing", "Invoices", DEFAULT_BILLING_VIEW_COLUMNS);
  const [viewEditorOpen, setViewEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<ListView | null>(null);
  const [deleteViewTarget, setDeleteViewTarget] = useState<ListView | null>(null);
  const [viewFieldsOpen, setViewFieldsOpen] = useState(false);
  const [viewFiltersOpen, setViewFiltersOpen] = useState(false);
  const [viewChartsOpen, setViewChartsOpen] = useState(false);
  const [display, setDisplay] = useState<ListDisplayMode>("table");
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [kanban, setKanban] = useState(() => getKanbanConfig("billing", ALL_VIEW_ID));

  // Regenerate the official invoice PDF (same template as the WhatsApp copy) and open it.
  // The clinic's own invoice, from generate-invoice-pdf, shown in the page.
  //
  // It is deliberately THIS document and not a local rendering. I briefly
  // made the preview draw from invoicePrintableHtml instead, because the
  // clinic's browser blocks the backend host - ERR_BLOCKED_BY_CLIENT, an
  // extension - and a locally drawn page needs no request. But that put a
  // different-looking invoice in front of staff, which is worse than one
  // that will not display: the invoice is the clinic's document and its
  // layout is not ours to swap out. The printable copy is a fallback for
  // when the real one cannot be built at all, and says so when it appears.
  //
  // Download is the dependable route while that extension is in place: it
  // fetches the bytes by XHR - which the same host serves happily, being how
  // this page loads at all - and saves them through <a download>. Saving is
  // not navigating, and navigating is what gets blocked.
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfPages, setPdfPages] = useState<string[] | null>(null);
  const pdfBytes = useRef<ArrayBuffer | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfHtml, setPdfHtml] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [pdfDownloading, setPdfDownloading] = useState(false);
  // Only what the dialog needs: the number for its title, the id to download with.
  const [pdfInvoice, setPdfInvoice] = useState<{ id: string; invoice_number?: string | null } | null>(null);

  const openInvoicePDF = async (inv: { id: string; invoice_number?: string | null }) => {
    if (!inv?.id) {
      toast.error("Invoice id missing");
      return;
    }
    setPdfInvoice(inv);
    setPdfUrl(null);
    setPdfPages(null);
    pdfBytes.current = null;
    setPdfHtml(null);
    setPdfError(null);
    setPdfNotice(null);
    setPdfOpen(true);
    // Everything the generator writes from here on belongs to this print.
    const askedAt = new Date();
    try {
      let url: string | undefined;
      let reason: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
          body: { invoiceId: inv.id, wait: true },
        });
        if (error) {
          throw new Error(
            await edgeFunctionErrorMessage(error, "The invoice PDF could not be prepared."),
          );
        }
        url = (data as { url?: string } | null)?.url;
        if (!url) throw new Error("The invoice PDF was prepared but its address came back empty.");
      } catch (callFailed) {
        // The generator is slow under load and usually finishes anyway - on
        // 3 October one invoice's PDF landed 82 minutes after the bill. Rather
        // than drop straight to the fallback template, wait a little and take
        // the document it writes. Only one written after we asked is accepted,
        // so an older PDF from before an edit can never stand in.
        reason = callFailed instanceof Error ? callFailed.message : String(callFailed);
        url =
          (await waitForInvoicePdf({
            askedAt,
            read: async () => {
              const { data } = await supabase
                .from("invoices")
                .select("pdf_url, updated_at")
                .eq("id", inv.id)
                .maybeSingle();
              return data ?? null;
            },
          })) ?? undefined;
        if (!url) throw new Error(reason);
      }
      const stamped = `${url}?t=${Date.now()}`;
      setPdfUrl(stamped);
      // Fetched as bytes and drawn, rather than handed to the browser to
      // open. The bytes are kept for Download so it needs no second trip.
      const res = await fetch(stamped);
      if (!res.ok) throw new Error(`The invoice PDF could not be fetched (${res.status})`);
      const bytes = await res.arrayBuffer();
      pdfBytes.current = bytes;
      setPdfPages(await renderPdfToImages(bytes));
    } catch (e) {
      console.error(e);
      // Only when the real invoice cannot be built or drawn. This template is
      // not the clinic's invoice and must never stand in for it silently
      // while the proper one is available.
      //
      // The reason is shown, not only logged. It used to go to the console and
      // a toast that named nothing, so every report of this was a fresh guess
      // at which of the four steps had failed.
      const reason = e instanceof Error ? e.message : String(e);
      // A notice, not an error: the fallback copy is still shown and still
      // prints, because there is a patient at the desk waiting for a bill.
      setPdfNotice(`${reason} Showing the plain printable copy instead.`);
      toast.message("The invoice PDF could not be shown - showing the plain printable copy");
      setPdfHtml(invoicePrintableHtml(inv));
    }
  };

  const saveBytes = (bytes: ArrayBuffer, filename: string) => {
    const objUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  };

  const downloadInvoicePDF = async () => {
    const inv = pdfInvoice;
    if (!inv?.id) return;
    const filename = `${inv.invoice_number || "invoice"}.pdf`;
    // Already fetched to draw the preview - no need to ask again.
    if (pdfBytes.current) {
      saveBytes(pdfBytes.current, filename);
      toast.success("Invoice downloaded");
      return;
    }
    setPdfDownloading(true);
    const t = toast.loading("Generating invoice PDF…");
    try {
      const { data, error } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { invoiceId: inv.id, wait: true },
        timeout: 45000,
      });
      if (error) {
        throw new Error(
          await edgeFunctionErrorMessage(error, "The invoice PDF could not be prepared."),
        );
      }
      const url = (data as any)?.url;
      if (!url) throw new Error("PDF url missing");
      // Fetched, not linked to: a cross-origin href would make the browser
      // navigate to the file, which is the blocked path.
      const res = await fetch(`${url}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`The PDF could not be fetched (${res.status})`);
      saveBytes(await res.arrayBuffer(), filename);
      toast.dismiss(t);
      toast.success("Invoice downloaded");
    } catch (e: any) {
      console.error(e);
      toast.dismiss(t);
      toast.error(
        e?.message ||
          "The PDF could not be downloaded. The invoice on screen can still be printed.",
      );
    } finally {
      setPdfDownloading(false);
    }
  };

  const [open, setOpen] = useState(false);
  // Seeded from ?q= so global search can hand a term to this list view
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [paymentInv, setPaymentInv] = useState<any>(null);
  const [addPaymentAmount, setAddPaymentAmount] = useState(0);
  const [addPaymentMode, setAddPaymentMode] = useState("Cash");
  // In the address, so Back closes the panel instead of leaving Billing.
  const { openId: selectedAppointmentId, open: openAppointment, close: closeAppointment } = useUrlPanel("appointment");

  // View/Edit Sheet
  const [viewInvoice, setViewInvoice] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  // What the invoice held when Edit was opened: the lines as stored, to tell
  // whether they were changed at all, and the product quantities, to put the
  // difference back on the shelf.
  const editedLinesOriginal = useRef<{ lineItems: string; products: { inventory_id: string; quantity: number; uom_factor: number }[] }>({ lineItems: "[]", products: [] });
  const [editData, setEditData] = useState<any>({});
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>();
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>();
  const [filterDoctor, setFilterDoctor] = useState("");
  const [filterService, setFilterService] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);

  // Any change to search/filters/the active saved view changes which
  // invoices match, so the current page number no longer means anything.
  useEffect(() => {
    setPage(1);
  }, [search, filterDateFrom, filterDateTo, filterDoctor, filterService, filterType, filterStatus, activeView?.id, display]);

  // Form state
  const [patientId, setPatientId] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [serviceInputs, setServiceInputs] = useState<{ name: string; price: number; hsn: string; gst: number; service_id?: string; material_percent?: string }[]>([{ name: "", price: 0, hsn: "", gst: 0 }]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [paymentType, setPaymentType] = useState("One-time");
  const [paymentMode, setPaymentMode] = useState("Cash");
  // Which of the three front desk staff raised the bill. Internal - see
  // src/lib/billedBy.ts. Empty until somebody picks, so a bill nobody stamped
  // says so rather than naming whoever happens to be first in the list.
  const [billedBy, setBilledBy] = useState("");
  const [notes, setNotes] = useState("");
  // Split payment (Create Invoice — One-time only). Empty array = single mode flow.
  const [splits, setSplits] = useState<{ mode: string; amount: number }[]>([]);
  // When split payment is active, the paid amount is always the sum of the split rows
  const splitTotalAmount = splits.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  // Read patientId from query parameter (from patient detail page)
  useEffect(() => {
    const qPatientId = searchParams.get("patientId");
    if (qPatientId) {
      setPatientId(qPatientId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (splits.length > 0) setPaidAmount(splitTotalAmount);
  }, [splits.length, splitTotalAmount]);
  // Tax is now resolved per-line from Tax Master mappings (no manual selector)
  const [pharmaItems, setPharmaItems] = useState<PharmaLineItem[]>([]);

  const [stages, setStages] = useState<StageRow[]>([{ label: "Stage 1", amount: 0, paid: 0 }]);
  const [recurringCount, setRecurringCount] = useState(0);
  const [recurringAmount, setRecurringAmount] = useState(0);
  const [recurringCollected, setRecurringCollected] = useState<number[]>([0]);
  const [recurringTotalAmount, setRecurringTotalAmount] = useState(0);
  const [recurringDueDates, setRecurringDueDates] = useState<Date[]>([new Date()]);
  // Per-installment appointment date (auto-follows the due date unless overridden)
  const [recurringApptDates, setRecurringApptDates] = useState<(Date | null)[]>([]);
  const [recurringStatuses, setRecurringStatuses] = useState<string[]>(["Pending"]);
  // Per-installment "Invoice now" tick — ticked installments are billed on this invoice
  const [recurringInvoiceNow, setRecurringInvoiceNow] = useState<boolean[]>([true]);
  // Per-installment "Book a visit" tick — independent of the installment count;
  // an installment plan doesn't have to match the number of scheduled visits.
  const [recurringCreateAppt, setRecurringCreateAppt] = useState<boolean[]>([true]);
  // Appointment this invoice originated from (installment #1 links to it)
  const [sourceAppointmentId, setSourceAppointmentId] = useState<string | null>(null);
  const [serviceSearchOpen, setServiceSearchOpen] = useState<number | null>(null);
  const [invoiceDate, setInvoiceDate] = useState<Date>(new Date());

  const handleRecurringCountChange = (count: number) => {
    // 0 is allowed so the field can sit empty (placeholder) until the user types.
    const c = Math.max(0, count);
    setRecurringCount(c);
    setRecurringCollected((prev) => {
      const arr = [...prev];
      while (arr.length < c) arr.push(0);
      return arr.slice(0, c);
    });
    setRecurringDueDates((prev) => {
      const arr = [...prev];
      const baseDate = arr[0] || new Date();
      while (arr.length < c) arr.push(addMonths(baseDate, arr.length));
      return arr.slice(0, c);
    });
    setRecurringStatuses((prev) => {
      const arr = [...prev];
      while (arr.length < c) arr.push("Pending");
      return arr.slice(0, c);
    });
    setRecurringInvoiceNow((prev) => {
      const arr = [...prev];
      while (arr.length < c) arr.push(false);
      return arr.slice(0, c);
    });
    setRecurringCreateAppt((prev) => {
      const arr = [...prev];
      // Only the first installment defaults to booking a visit (it usually
      // links to the appointment this invoice was opened from); the rest
      // default off - staff opts in per installment.
      while (arr.length < c) arr.push(false);
      return arr.slice(0, c);
    });
    if (recurringTotalAmount > 0) {
      setRecurringAmount(Math.round((recurringTotalAmount / c) * 100) / 100);
    }
  };

  const handleRecurringTotalChange = (total: number) => {
    setRecurringTotalAmount(total);
    if (recurringCount > 0) {
      setRecurringAmount(Math.round((total / recurringCount) * 100) / 100);
    }
  };

  // A quick filter, active search, any view other than the default "All"
  // view (this includes "Recently Viewed", which - like a custom saved
  // view - isn't just "the newest invoices" - and every custom saved
  // view), or Kanban display all need the full (client-side-filterable)
  // matching set in memory - everything else uses true server-side
  // pagination so the common case (the default table view) costs one
  // request instead of fetchAll()'s ~30 sequential requests across the
  // whole invoices table. Mirrors Patients.tsx's isAllView/needsClientRows.
  const isAllView = !activeView || activeView.id === ALL_VIEW_ID;
  // Search + the enum quick filters are pushed to the server
  // (fetchInvoicesSearch) so they cover the WHOLE invoices table - the old
  // bounded client-side fetch only kept the newest 3,000 rows, which made
  // older invoices unreachable via search/filter.
  const needsServerSearch = !!(search.trim() || filterDoctor || filterService || filterType || filterStatus);
  const hasActiveFilters = !!(filterDateFrom || filterDateTo) || needsServerSearch;
  const needsClientRows = !isAllView || hasActiveFilters || display === "kanban";

  /**
   * The date window the active saved view itself implies, pushed to the server.
   *
   * "Today's Billing" was fetching the WHOLE invoices table - fetchAll pages at
   * 1,000 rows, so 46,938 invoices meant about 47 sequential round trips - and
   * only then keeping today's dozen in memory. That is why it took so long, and
   * why it showed 0: until all of those requests finish the query has no data,
   * so the table honestly reports nothing found, and any one of them failing
   * leaves it empty.
   *
   * The view's own condition is a date range the database can apply, so it goes
   * to the database. A view whose window cannot be expressed exactly still
   * fetches everything and filters in memory, which is slow but never wrong.
   */
  const viewDateRange = (() => {
    const preset = viewDatePreset(activeView?.filters, "created_at");
    if (!preset || preset.preset === "all") return null;
    if (preset.preset === "specific") {
      return preset.specificDate ? dateRangeFor("on", preset.specificDate.toISOString()) : null;
    }
    if (preset.preset === "range") {
      return preset.rangeFrom && preset.rangeTo
        ? dateRangeFor("between", preset.rangeFrom.toISOString(), preset.rangeTo.toISOString())
        : null;
    }
    return dateRangeFor(preset.preset);
  })();

  // What the user picked wins over what the view implies, so narrowing a view
  // by hand still works.
  const fetchDateFrom = filterDateFrom ?? viewDateRange?.from;
  const fetchDateTo = filterDateTo ?? viewDateRange?.to;

  const {
    isLoading: pagedLoading,
    data: pagedData,
    error: pagedError,
  } = useQuery({
    queryKey: ["invoices-page", page, filterDateFrom, filterDateTo],
    queryFn: () => fetchInvoicesPage({ page, pageSize: PAGE_SIZE, dateFrom: filterDateFrom, dateTo: filterDateTo }),
    enabled: !needsClientRows,
  });

  const {
    isLoading: boundedLoading,
    data: boundedInvoices = [],
    error: boundedError,
  } = useQuery({
    queryKey: ["invoices-bounded", fetchDateFrom, fetchDateTo],
    queryFn: () => fetchInvoicesInRange({ dateFrom: fetchDateFrom, dateTo: fetchDateTo }),
    enabled: needsClientRows && !needsServerSearch,
  });

  const {
    isLoading: searchLoading,
    data: searchedInvoices = [],
    error: searchError,
  } = useQuery({
    queryKey: ["invoices-search", search, filterDoctor, filterService, filterType, filterStatus, filterDateFrom, filterDateTo],
    queryFn: () => fetchInvoicesSearch({
      search,
      doctorId: filterDoctor || undefined,
      service: filterService || undefined,
      paymentType: filterType || undefined,
      status: filterStatus || undefined,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
    }),
    enabled: needsServerSearch,
  });

  const invoices: any[] = needsServerSearch ? searchedInvoices : needsClientRows ? boundedInvoices : pagedData?.rows ?? [];
  // Which query is feeding the table decides whether it is still loading. An
  // empty result and a result that has not arrived look identical in the data,
  // and the table was reporting both as "No invoices found" - so a slow view
  // read as an empty day.
  const invoicesLoading = needsServerSearch ? searchLoading : needsClientRows ? boundedLoading : pagedLoading;
  const invoicesError = needsServerSearch ? searchError : needsClientRows ? boundedError : pagedError;

  useEffect(() => {
    if (invoicesError) {
      console.error("Failed to load invoices:", invoicesError);
      toast.error(`Failed to load invoices: ${(invoicesError as Error).message}`);
    }
  }, [invoicesError]);

  // Appointments belonging to a patient — used to re-link an installment to a
  // different visit of the SAME patient when editing, and to attach a bill
  // raised from this page to the visit it pays for when creating.
  const fetchPatientAppointments = async (id: string | null) => {
    if (!id) return [];
    const { data, error } = await supabase
      .from("appointments")
      // staff_id is what separates two visits on one day when the bill has to
      // choose between them - see pickAppointmentForInvoice.
      // reason_for_consultation too: it is the "Investigation" the appointments
      // list labels a visit by, and every appointment booked in this app leaves
      // `service` empty - see visitLabel.ts.
      .select("id, service, reason_for_consultation, start_time, status, staff_id")
      .eq("patient_id", id)
      .order("start_time", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data || [];
  };

  /** The picker needs the display fields as well as what the guess reads. */
  type PickerAppointment = LinkableAppointment & {
    service?: string | null;
    reason_for_consultation?: string | null;
    status?: string | null;
  };

  const linkPatientId = (viewInvoice as any)?.patient_id || null;
  const { data: patientAppointments = [] } = useQuery({
    queryKey: ["invoice-patient-appointments", linkPatientId],
    queryFn: () => fetchPatientAppointments(linkPatientId),
    enabled: !!linkPatientId,
  });

  // The same list for whoever is selected in the create form.
  const { data: createPatientAppointments = [] } = useQuery({
    queryKey: ["invoice-patient-appointments", patientId],
    queryFn: () => fetchPatientAppointments(patientId),
    enabled: !!patientId,
  });

  // A bill raised from this page used to save with appointment_id null, so the
  // appointments list - which looks bills up by that column alone - reported
  // the visit as unbilled. Guess the visit when the guess is unambiguous, and
  // show it in the form so staff can correct it before saving.
  const suggestedAppointmentId = useMemo(
    () =>
      pickAppointmentForInvoice(createPatientAppointments as LinkableAppointment[], {
        invoiceDate,
        doctorId,
      }),
    [createPatientAppointments, invoiceDate, doctorId],
  );

  // undefined = nobody has touched the picker, so follow the suggestion;
  // "" = deliberately unlinked. Keeping the two apart is what lets the
  // suggestion update as the patient or date changes without overriding a
  // choice staff already made.
  const [linkAppointmentChoice, setLinkAppointmentChoice] = useState<string | undefined>(undefined);

  const createApptIds = useMemo(
    () => new Set((createPatientAppointments as PickerAppointment[]).map((a) => a.id)),
    [createPatientAppointments],
  );

  // A chosen id only counts while it still belongs to the patient on the form.
  // Switching the patient after picking would otherwise bill this patient's
  // money against someone else's appointment, and the list would show it there.
  // An explicit "" (Not linked) is a choice and survives.
  const choiceStillValid =
    linkAppointmentChoice !== undefined &&
    (linkAppointmentChoice === "" || createApptIds.has(linkAppointmentChoice));
  const effectiveLinkAppointmentId = choiceStillValid
    ? (linkAppointmentChoice as string)
    // sourceAppointmentId covers the moment before the patient's appointments
    // have loaded, when a prefilled choice cannot be confirmed yet.
    : suggestedAppointmentId || sourceAppointmentId || "";

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

  const { data: taxes = [] } = useQuery({
    queryKey: ["tax-master-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tax_master").select("*").eq("is_active", true).order("rate");
      if (error) throw error;
      return data;
    },
  });

  const { data: hsnTaxes = [] } = useQuery({
    queryKey: ["hsn-tax-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hsn_tax_master")
        .select("id, hsn_code, igst, cgst, sgst")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: taxProductLinks = [] } = useQuery({
    queryKey: ["tax-master-products-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_master_products")
        .select("product_id, tax_id, is_active, tax_master!inner(is_active)")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).filter((r: any) => r.tax_master?.is_active);
    },
  });

  const productTaxMap = useMemo(() => {
    const m = new Map<string, string>();
    (taxProductLinks as any[]).forEach((r) => m.set(r.product_id, r.tax_id));
    return m;
  }, [taxProductLinks]);

  const { data: taxServiceLinks = [] } = useQuery({
    queryKey: ["tax-master-services-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tax_master_services" as any)
        .select("service_id, tax_id, is_active, tax_master!inner(is_active)")
        .eq("is_active", true);
      if (error) throw error;
      return (data || []).filter((r: any) => r.tax_master?.is_active);
    },
  });

  const serviceTaxMap = useMemo(() => {
    const m = new Map<string, string>();
    (taxServiceLinks as any[]).forEach((r) => m.set(r.service_id, r.tax_id));
    return m;
  }, [taxServiceLinks]);

  const { data: pharmaProducts = [] } = useQuery({
    queryKey: ["pharma-products-billing"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pharma_products").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceMaster = [] } = useQuery({
    queryKey: ["services-master-billing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, price, hsn_code, gst_percent, material_percent" as any)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Doctors list for the new "Doctor" dropdown
  const { data: doctorsList = [] } = useQuery({
    queryKey: ["staff-doctors-billing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, role, specialization, consultation_fee, consultation_hsn, is_active" as any)
        .eq("role", "Doctor")
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return data || [];
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
      case "status": return ["Paid", "Partial", "Pending"].map((s) => ({ value: s, label: s }));
      // The modes Billing actually writes, plus "Split" for a bill taken across
      // two of them. The old list offered "Online Transfer", which nothing
      // stores, and omitted UPI - most of the clinic's takings - so filtering a
      // saved view by payment mode could not find them.
      case "payment_mode": return ["Cash", "Card", "UPI", "Bank Transfer", "Cheque", "Split"].map((s) => ({ value: s, label: s }));
      default: return [];
    }
  };

  const kanbanGroupFields = BILLING_VIEW_FIELDS.filter((f) => f.type === "picklist");
  const kanbanSummaryFields = BILLING_VIEW_FIELDS.filter((f) => f.type === "number");
  const kanbanOptions = viewOptionsFor(fieldDefIn(BILLING_VIEW_FIELDS, kanban.group_field)?.optionsSource);

  const moveKanbanCard = async (inv: any, field: string, value: string) => {
    const { data: written, error } = await supabase
      .from("invoices").update({ [field]: value || null } as any).eq("id", inv.id).select("id");
    if (error) { toast.error(error.message); return; }
    // Zero rows back means RLS filtered the write - no error is raised for that,
    // so without this the card moved on screen and nothing was saved.
    if (!written || written.length === 0) { toast.error(NOT_YOURS_MESSAGE); invalidateInvoices(); return; }
    toast.success("Invoice updated");
    invalidateInvoices();
  };

  useEffect(() => {
    setKanban(getKanbanConfig("billing", activeView?.id ?? ALL_VIEW_ID));
  }, [activeView?.id]);

  // Doctor/patient name are denormalized onto each invoice at creation time
  // and never recomputed - these maps let the UI fall back to a live lookup
  // (by invoices.doctor_id / invoices.patient_id) for older or recurring-
  // installment invoices that were saved without a name, or without an
  // appointment link for getDrName's usual join to find a doctor through.
  const staffById = useMemo(() => new Map(staffList.map((s: any) => [s.id, s])), [staffList]);
  const patientById = useMemo(() => new Map(patients.map((p: any) => [p.id, p])), [patients]);

  const { data: productUnitsData } = usePharmaProductUnits();
  const unitsByProduct = productUnitsData?.byProduct || {};

  const { data: pharmaInventory = [] } = useQuery({
    queryKey: ["pharma-inventory-billing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pharma_inventory")
        .select("*, pharma_products(name, selling_price)")
        .order("expiry_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const resetForm = useCallback(() => {
    setPatientId("");
    setDoctorId("");
    setInvoiceDate(new Date());
    setServiceInputs([{ name: "", price: 0, hsn: "", gst: 0 }]);
    setPaidAmount(0);
    setPaymentType("One-time");
    setPaymentMode("Cash");
    setBilledBy("");
    setSplits([]);
    setNotes("");
    // tax is per-line, nothing to reset
    setPharmaItems([]);
    setStages([{ label: "Stage 1", amount: 0, paid: 0 }]);
    setRecurringCount(1);
    setRecurringAmount(0);
    setRecurringCollected([0]);
    setRecurringTotalAmount(0);
    setRecurringDueDates([new Date()]);
    setRecurringApptDates([]);
    setRecurringStatuses(["Pending"]);
    setRecurringInvoiceNow([true]);
    setSourceAppointmentId(null);
    setLinkAppointmentChoice(undefined);
    setServiceSearchOpen(null);
    // Only state setters above, all stable, so this never needs to change.
  }, []);

  /**
   * Does the Create Invoice form hold anything worth not throwing away?
   *
   * Opening the dialog now clears it, which makes an accidental Escape
   * unrecoverable - so an accidental Escape is what gets prevented instead.
   * The X in the corner stays the deliberate way out, and it discards.
   */
  const createFormHasContent = () =>
    invoiceFormHasContent({
      patientId,
      doctorId,
      serviceInputs,
      pharmaItemCount: pharmaItems.length,
      paidAmount,
      notes,
    });

  // Pre-fill from Appointments flow
  useEffect(() => {
    const prefillPatient = searchParams.get("prefillPatient");
    const prefillService = searchParams.get("prefillService");
    if (prefillPatient || prefillService) {
      // Clear whatever the form was last left holding before filling it: the
      // same state backs Edit Invoice and the "New Bill" prefill, so without
      // this the new bill inherits the previous one's lines.
      resetForm();
      if (prefillPatient) setPatientId(prefillPatient);
      // The booked service is deliberately not put on the bill - see
      // billingPrefill.ts. Answering the prompt opens the form on the right
      // patient; what gets charged is typed here.

      // Payment Type stays at its "One-time" default here - a visit being
      // recurring doesn't imply the bill should be split into installments;
      // staff picks "Recurring" (installment plan) explicitly when needed.
      setOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, resetForm]);

  // Open a specific invoice via ?viewInvoice=<id> (e.g. from Patient detail).
  // Default (server-paginated) mode only holds one page of invoices in
  // memory, so the target row usually isn't there - fetch it directly
  // rather than depending on it happening to be on the loaded page/set.
  useEffect(() => {
    const viewId = searchParams.get("viewInvoice");
    if (!viewId || viewId === "__new__") return;
    const consume = (inv: any) => {
      setViewInvoice(inv);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("viewInvoice");
        return next;
      }, { replace: true });
    };
    const existing = (invoices as any[]).find((i: any) => i.id === viewId);
    if (existing) {
      consume(existing);
      return;
    }
    let cancelled = false;
    fetchInvoiceById(viewId).then((inv) => {
      if (!cancelled && inv) consume(inv);
    });
    return () => {
      cancelled = true;
    };
  }, [searchParams, invoices]);

  // Open the Create Invoice form on the right patient and the right visit
  // ("New Bill" / "Create Invoice" flow). Payload is stashed in sessionStorage
  // to avoid huge URLs.
  useEffect(() => {
    if (searchParams.get("newInvoice") !== "1") return;
    // Only the patient, the doctor and the visit - never a line item. The rule
    // and the reasoning are in billingPrefill.ts.
    const payload = readBillingPrefill(sessionStorage.getItem("billing_prefill"));
    sessionStorage.removeItem("billing_prefill");

    // Same reason as the route above: empty the form first, then fill it from
    // this appointment only.
    resetForm();

    // Billing a patient from their own record arrives as ?patientId=...&newInvoice=1
    // with no stashed payload, and resetForm() above has just cleared the id the
    // effect at the top of this file set. Without this the form opened empty and
    // a bill could be saved with no patient at all - INV-49169 was exactly that.
    const queryPatientId = searchParams.get("patientId");
    if (payload.patientId) setPatientId(payload.patientId);
    else if (queryPatientId) setPatientId(queryPatientId);
    if (payload.doctorId) setDoctorId(payload.doctorId);
    if (payload.appointmentId) {
      setSourceAppointmentId(payload.appointmentId);
      // Show it in the picker too, so the form states which visit it will bill
      // rather than linking silently.
      setLinkAppointmentChoice(payload.appointmentId);
    }

    // Payment Type is left at its "One-time" default regardless of whether the
    // source procedure/appointment is a recurring visit - visit cadence and
    // billing plan are independent; staff picks "Recurring" (installment
    // plan) explicitly, e.g. for a high-value package split into payments.
    setInvoiceDate(new Date());
    setOpen(true);
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // The visit already records who saw the patient, so the bill does not have to
  // ask. Only fills a blank - a doctor chosen by hand is never overridden - and
  // says nothing when that day's visits disagree about the doctor.
  useEffect(() => {
    if (!open || !patientId || doctorId) return;
    const fromVisit = doctorForInvoice(createPatientAppointments as LinkableAppointment[], invoiceDate);
    if (fromVisit) setDoctorId(fromVisit);
  }, [open, patientId, doctorId, createPatientAppointments, invoiceDate]);

  // Doctor/service filter dropdown options - sourced from the doctors/
  // services master lists (already fetched regardless) rather than scanned
  // from `invoices`, since the default view only ever holds one page of
  // invoices in memory now.
  const uniqueDoctors = useMemo(() => {
    return (doctorsList as any[])
      .map((d: any): [string, string] => [d.id, `${d.first_name || ""} ${d.last_name || ""}`.trim()])
      .filter(([, name]) => !!name)
      .sort((a, b) => a[1].localeCompare(b[1]));
  }, [doctorsList]);

  const uniqueServices = useMemo(() => {
    return Array.from(new Set((serviceMaster as any[]).map((s: any) => s.name).filter(Boolean))).sort();
  }, [serviceMaster]);

  const getTaxComponents = (tax: any) => {
    if (!tax) return { cgst: 0, sgst: 0, igst: 0, total: 0 };
    const cgst = Number(tax.cgst) || 0;
    const sgst = Number(tax.sgst) || 0;
    const igst = Number(tax.igst) || 0;
    const total = cgst + sgst + igst || Number(tax.rate) || 0;
    return { cgst, sgst, igst, total };
  };

  // Per-line tax resolver: looks up the tax mapping for a service/product id and returns its components
  const taxById = useMemo(() => {
    const m = new Map<string, any>();
    (taxes as any[]).forEach((t) => m.set(t.id, t));
    return m;
  }, [taxes]);

  const getLineTax = (taxId: string | undefined, amount: number) => {
    if (!taxId) return { rate: 0, cgst: 0, sgst: 0, igst: 0, taxAmount: 0 };
    const tax = taxById.get(taxId);
    const { cgst, sgst, igst, total } = getTaxComponents(tax);
    const cgstAmt = (amount * cgst) / 100;
    const sgstAmt = (amount * sgst) / 100;
    const igstAmt = (amount * igst) / 100;
    return { rate: total, cgst: cgstAmt, sgst: sgstAmt, igst: igstAmt, taxAmount: cgstAmt + sgstAmt + igstAmt };
  };

  // Resolve tax id for a service line (by name → service master → mapping)
  const getServiceTaxId = (serviceName: string): string | undefined => {
    const svc = (serviceMaster as any[]).find((s) => s.name === serviceName);
    return svc ? serviceTaxMap.get(svc.id) : undefined;
  };

  // HSN-based tax (Tax Master): service → HSN code → SGST + CGST + IGST
  /**
   * The codes the Tax Master currently allows, and only those.
   *
   * This used to also offer whatever code was already on the line, which put a
   * retired code (9997) back in front of the front desk every time a service
   * still stored it. Retiring a code in the Tax Master is now the end of it -
   * see liveHsn(), which keeps a retired code off the line as well as out of
   * this list.
   */
  const activeCodes = useMemo(() => activeHsnCodes(hsnTaxes), [hsnTaxes]);
  const hsnOptions = useMemo(() => buildHsnOptions(hsnTaxes), [hsnTaxes]);

  const hsnTaxMap = useMemo(() => {
    const m = new Map<string, any>();
    (hsnTaxes as any[]).forEach((h) => m.set(String(h.hsn_code), h));
    return m;
  }, [hsnTaxes]);

  // Keep the shared (module-level) HSN rate cache in sync so the invoice view
  // and the printed invoice can resolve GST for older saved line items.
  useEffect(() => {
    (hsnTaxes as any[]).forEach((h) => {
      hsnRateCache[String(h.hsn_code).trim()] =
        (Number(h.sgst) || 0) + (Number(h.cgst) || 0) + (Number(h.igst) || 0);
    });
  }, [hsnTaxes]);

  const getServiceLineTax = (serviceName: string, amount: number, lineHsn?: string) => {
    const svc = (serviceMaster as any[]).find((s) => s.name === serviceName);
    const hsn = (lineHsn && lineHsn.trim()) || svc?.hsn_code || "";
    const hsnTax = hsn ? hsnTaxMap.get(String(hsn)) : undefined;
    if (hsnTax) {
      const igst = Number(hsnTax.igst) || 0;
      const cgst = Number(hsnTax.cgst) || 0;
      const sgst = Number(hsnTax.sgst) || 0;
      const igstAmt = (amount * igst) / 100;
      const cgstAmt = (amount * cgst) / 100;
      const sgstAmt = (amount * sgst) / 100;
      return { rate: igst + cgst + sgst, cgst: cgstAmt, sgst: sgstAmt, igst: igstAmt, taxAmount: igstAmt + cgstAmt + sgstAmt };
    }
    return getLineTax(getServiceTaxId(serviceName), amount);
  };


  const getProductTaxId = (productId: string): string | undefined => productTaxMap.get(productId);

  // Resolve the HSN code that applies to a pharma line: inward batch → product master.
  const getProductHsn = (productId: string, inventoryId?: string): string => {
    const batch = inventoryId ? (pharmaInventory as any[]).find((i) => i.id === inventoryId) : undefined;
    if (batch?.hsn_code) return String(batch.hsn_code);
    const prod = (pharmaProducts as any[]).find((p) => p.id === productId);
    return prod?.hsn_code ? String(prod.hsn_code) : "";
  };

  // Product line tax priority:
  // 1. Inward stock batch IGST/CGST (captured at Inward Stock)
  // 2. Product master IGST/CGST
  // 3. Inward stock batch GST % + HSN Tax Master split
  // 4. HSN Tax Master entry for that HSN
  // 5. Tax Master product mapping
  // 6. Product master GST %
  const getProductLineTax = (productId: string, amount: number, inventoryId?: string) => {
    const batch = inventoryId ? (pharmaInventory as any[]).find((i) => i.id === inventoryId) : undefined;
    const prodRow = (pharmaProducts as any[]).find((p) => p.id === productId);
    const hsn = getProductHsn(productId, inventoryId);
    const hsnTax = hsn ? hsnTaxMap.get(String(hsn)) : undefined;

    // Explicit IGST/CGST split — batch first, then product master.
    const splitIgst = Number(batch?.igst_percent) || 0;
    const splitCgst = Number(batch?.cgst_percent) || 0;
    const pIgst = Number(prodRow?.igst_percent) || 0;
    const pCgst = Number(prodRow?.cgst_percent) || 0;
    const igstP = splitIgst + splitCgst > 0 ? splitIgst : pIgst;
    const cgstP = splitIgst + splitCgst > 0 ? splitCgst : pCgst;
    if (igstP + cgstP > 0 && amount) {
      return {
        rate: igstP + cgstP,
        cgst: (amount * cgstP) / 100,
        sgst: 0,
        igst: (amount * igstP) / 100,
        taxAmount: (amount * (igstP + cgstP)) / 100,
      };
    }

    const hsnSplit = hsnTax
      ? {
          igst: Number(hsnTax.igst) || 0,
          cgst: Number(hsnTax.cgst) || 0,
          sgst: Number(hsnTax.sgst) || 0,
        }
      : null;
    const hsnTotal = hsnSplit ? hsnSplit.igst + hsnSplit.cgst + hsnSplit.sgst : 0;
    const fromHsn = () => ({
      rate: hsnTotal,
      cgst: (amount * (hsnSplit!.cgst)) / 100,
      sgst: (amount * (hsnSplit!.sgst)) / 100,
      igst: (amount * (hsnSplit!.igst)) / 100,
      taxAmount: (amount * hsnTotal) / 100,
    });

    const batchRate = Number(batch?.gst_percent) || 0;
    if (batchRate > 0 && amount) {
      if (hsnTotal > 0) return fromHsn();
      const half = (amount * batchRate) / 200;
      return { rate: batchRate, cgst: half, sgst: half, igst: 0, taxAmount: half * 2 };
    }

    if (hsnTotal > 0 && amount) {
      return fromHsn();
    }


    const mapped = getLineTax(getProductTaxId(productId), amount);
    if (mapped.rate > 0) return mapped;
    const prod = (pharmaProducts as any[]).find((p) => p.id === productId);
    const rate = Number(prod?.gst_percent) || 0;
    if (!rate || !amount) return { rate: 0, cgst: 0, sgst: 0, igst: 0, taxAmount: 0 };
    const half = (amount * rate) / 200;
    return { rate, cgst: half, sgst: half, igst: 0, taxAmount: half * 2 };
  };

  // Unified per-line rows used by the invoice summary (tax by line item).
  const lineTaxRows = useMemo(() => {
    const rows: { key: string; kind: "Service" | "Product"; name: string; hsn: string; qty: number; amount: number; rate: number; cgst: number; sgst: number; igst: number; tax: number }[] = [];
    serviceInputs.forEach((s: any, i) => {
      const amount = Number(s.price) || 0;
      if (!String(s.name || "").trim() || !amount) return;
      const t = getServiceLineTax(s.name, amount, s.hsn);
      rows.push({ key: `s-${i}`, kind: "Service", name: s.name, hsn: s.hsn || "", qty: 1, amount, rate: t.rate, cgst: t.cgst, sgst: t.sgst, igst: t.igst, tax: t.taxAmount });
    });
    pharmaItems.forEach((p, i) => {
      const amount = p.quantity * p.unit_price;
      if (!p.product_id || !amount) return;
      const t = getProductLineTax(p.product_id, amount, p.inventory_id);
      rows.push({ key: `p-${i}`, kind: "Product", name: p.product_name, hsn: getProductHsn(p.product_id, p.inventory_id), qty: p.quantity, amount, rate: t.rate, cgst: t.cgst, sgst: t.sgst, igst: t.igst, tax: t.taxAmount });
    });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceInputs, pharmaItems, serviceMaster, pharmaProducts, pharmaInventory, hsnTaxes, taxProductLinks, taxServiceLinks, taxes]);

  const pharmaSubtotal = pharmaItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  /**
   * The stored shape of every billed line, built in one place.
   *
   * Create and Edit both write this. Two implementations would be two chances
   * for the record and the printed copy to disagree about what was charged,
   * which is exactly the failure Edit already had - it could change the total
   * without touching the lines the PDF is drawn from.
   */
  const lineItemsSnapshotFor = (
    services: typeof serviceInputs,
    products: PharmaLineItem[],
    // Json, not a looser shape: this goes straight into the jsonb column, and
    // the compiler should say so if a line ever stops being storable.
  ): Json[] => [
        ...services
          .filter((s) => s.name.trim())
          .map((s) => ({
            kind: "service",
            name: s.name,
            qty: 1,
            price: Number(s.price) || 0,
            hsn: s.hsn || "",
            gst: Number(s.gst) || 0,
            service_id: s.service_id && s.service_id !== OTHERS_VALUE ? s.service_id : null,
            // Read by the material_cost_lines view, which prefers it over the
            // visit's override and the Service Master default. Omitted rather
            // than stored as 0 when it was left blank, so "not recorded" stays
            // distinguishable from "no material cost".
            ...(String(s.material_percent ?? "").trim() === ""
              ? {}
              : { material_percent: Number(s.material_percent) || 0 }),
          })),
        ...products
          .filter((i) => i.product_name)
          .map((i) => ({
            kind: "product",
            name: i.product_name,
            qty: i.quantity,
            price: Number(i.unit_price) || 0,
            hsn: i.product_id === OTHERS_VALUE ? "" : getProductHsn(i.product_id, i.inventory_id),
            gst: i.product_id === OTHERS_VALUE ? 0 : getProductLineTax(i.product_id, 100, i.inventory_id).rate,
            product_id: i.product_id && i.product_id !== OTHERS_VALUE ? i.product_id : null,
            batch_number: i.batch_number || null,
            uom: i.uom || null,
            uom_factor: i.uom_factor || 1,
          })),
  ];

  // Tax and total straight off lineTaxRows, so the figure on the Edit form is
  // the same arithmetic the create summary and the save path both use.
  const lineTaxTotal = lineTaxRows.reduce((sum, r) => sum + r.tax, 0);
  const linesGrandTotal = lineTaxRows.reduce((sum, r) => sum + r.amount, 0) + lineTaxTotal;
  const servicesSubtotal = useMemo(() => serviceInputs.reduce((sum, s) => sum + (Number(s.price) || 0), 0), [serviceInputs]);

  // Internal-only material cost: % (from Service Master) of the pre-tax service value.
  // Never used in any invoice calculation.
  const materialRows = useMemo(() => {
    return serviceInputs
      .map((s: any) => {
        const svc = (serviceMaster as any[]).find((m: any) => m.name === s.name);
        const pct = Number(svc?.material_percent) || 0;
        const base = Number(s.price) || 0;
        if (!pct || !base) return null;
        return { name: s.name as string, percent: pct, base, cost: (base * pct) / 100 };
      })
      .filter(Boolean) as { name: string; percent: number; base: number; cost: number }[];
  }, [serviceInputs, serviceMaster]);
  const materialTotal = materialRows.reduce((s, r) => s + r.cost, 0);
  const [materialOpen, setMaterialOpen] = useState(false);

  const materialSection = materialRows.length > 0 ? (
    <div className="rounded-lg border border-dashed bg-muted/30 mt-3">
      <button
        type="button"
        onClick={() => setMaterialOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold"
      >
        <span>Material cost (internal only)</span>
        <span className="text-muted-foreground font-normal">{materialOpen ? "Hide" : "Show"}</span>
      </button>
      {materialOpen && (
        <div className="px-3 pb-3 space-y-1 text-[11px]">
          {materialRows.map((r) => (
            <div key={r.name} className="flex justify-between gap-2">
              <span className="min-w-0 truncate">{r.name} · {r.percent}% of {money(r.base)}</span>
              <span className="tabular-nums">{money(r.cost)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-1 mt-1 font-semibold">
            <span>Total material cost</span>
            <span className="tabular-nums">{money(materialTotal)}</span>
          </div>
          <div className="flex justify-between pt-1 font-semibold text-primary">
            <span>Actual service rate</span>
            <span className="tabular-nums">{money(Math.max(servicesSubtotal - materialTotal, 0))}</span>
          </div>
          <p className="text-[10px] text-muted-foreground pt-1">
            Actual service rate = total pre-tax services − material cost (pharmacy excluded). Not included in invoice totals.
          </p>
        </div>
      )}
    </div>
  ) : null;



  // Tax for a share of the bill (used by installments): each line taxed at its own rate, scaled.
  const scaledLineTax = (scale: number) => {
    let cgst = 0, sgst = 0, igst = 0;
    serviceInputs.forEach((s: any) => {
      if (!String(s.name || "").trim() || !s.price) return;
      const t = getServiceLineTax(s.name, Number(s.price) * scale, s.hsn);
      cgst += t.cgst; sgst += t.sgst; igst += t.igst;
    });
    pharmaItems.forEach((p) => {
      const amt = p.quantity * p.unit_price;
      if (!p.product_id || !amt) return;
      const t = getProductLineTax(p.product_id, amt * scale, p.inventory_id);
      cgst += t.cgst; sgst += t.sgst; igst += t.igst;
    });
    return { cgst, sgst, igst, tax: cgst + sgst + igst };
  };

  // Tax for a share of the SERVICES only (recurring installments never include pharmacy)
  const scaledServiceTax = (scale: number) => {
    let cgst = 0, sgst = 0, igst = 0;
    serviceInputs.forEach((s: any) => {
      if (!String(s.name || "").trim() || !s.price) return;
      const t = getServiceLineTax(s.name, Number(s.price) * scale, s.hsn);
      cgst += t.cgst; sgst += t.sgst; igst += t.igst;
    });
    return { cgst, sgst, igst, tax: cgst + sgst + igst };
  };

  // Full pharmacy tax — pharmacy is always paid in full, never split across installments
  const pharmaTaxTotals = useMemo(() => {
    let cgst = 0, sgst = 0, igst = 0;
    pharmaItems.forEach((p) => {
      const amt = p.quantity * p.unit_price;
      if (!p.product_id || !amt) return;
      const t = getProductLineTax(p.product_id, amt, p.inventory_id);
      cgst += t.cgst; sgst += t.sgst; igst += t.igst;
    });
    return { cgst, sgst, igst, tax: cgst + sgst + igst };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pharmaItems, productTaxMap, pharmaInventory, hsnTaxes]);

  // Per-installment tax + total (recurring plans) — services only
  const installmentTax = useMemo(() => {
    const scale = servicesSubtotal > 0 ? recurringAmount / servicesSubtotal : 0;
    return scaledServiceTax(scale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servicesSubtotal, recurringAmount, serviceInputs, serviceTaxMap]);
  const installmentTotal = recurringAmount + installmentTax.tax;

  // Installments explicitly ticked "Invoice now" are billed on this invoice
  const dueTodayIndexes = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < recurringCount; i++) {
      if (recurringInvoiceNow[i]) out.push(i);
    }
    return out;
  }, [recurringInvoiceNow, recurringCount]);

  // Auto-fill Recurring Total Amount from SERVICES subtotal only (pharmacy is paid in full)
  useEffect(() => {
    if (paymentType !== "Recurring") return;
    if (servicesSubtotal <= 0) return;
    setRecurringTotalAmount(servicesSubtotal);
    const c = Math.max(1, recurringCount);
    setRecurringAmount(Math.round((servicesSubtotal / c) * 100) / 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentType, servicesSubtotal, recurringCount]);

  // Keep "Paid" installments' collected amount in sync with the per-installment amount
  useEffect(() => {
    if (paymentType !== "Recurring") return;
    setRecurringCollected((prev) => {
      const next = [...prev];
      let changed = false;
      for (let i = 0; i < recurringCount; i++) {
        if (recurringStatuses[i] === "Paid" && next[i] !== recurringAmount) {
          next[i] = recurringAmount;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringAmount, recurringStatuses, recurringCount, paymentType]);

  const addPharmaItem = () => {
    setPharmaItems([...pharmaItems, { inventory_id: "", product_id: "", product_name: "", batch_number: "", quantity: 1, unit_price: 0, available: 0, uom: "", uom_factor: 1 }]);
  };

  // All pharma products are selectable (batch is optional — clinics may bill
  // products that have no inventory batch recorded yet).
  const pharmaProductOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pharmaProducts as any[]) {
      if (p?.id && p?.name) map.set(p.id, p.name);
    }
    for (const i of pharmaInventory as any[]) {
      if (i?.product_id && i.pharma_products?.name) map.set(i.product_id, i.pharma_products.name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [pharmaProducts, pharmaInventory]);

  const updatePharmaItem = (idx: number, field: string, value: any) => {
    const updated = [...pharmaItems];
    (updated[idx] as any)[field] = value;
    if (field === "product_id") {
      // Reset batch when product changes
      updated[idx].product_id = value;
      updated[idx].inventory_id = "";
      updated[idx].batch_number = "";
      updated[idx].available = 0;
      if (value === OTHERS_VALUE) {
        // Custom/free-text product: no master to look up, staff types the
        // name and price manually. Default to a plain "Unit" UOM.
        updated[idx].product_name = "";
        updated[idx].uom = "Unit";
        updated[idx].uom_factor = 1;
        updated[idx].unit_price = 0;
      } else {
        const prod = pharmaProductOptions.find(p => p.id === value);
        updated[idx].product_name = prod?.name || "";
        // Default price: newest usable batch → product selling price → MRP
        const batches = (pharmaInventory as any[])
          .filter((i: any) => i.product_id === value && i.quantity > 0 && new Date(i.expiry_date) > new Date())
          .sort((a: any, b: any) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
        const master = (pharmaProducts as any[]).find((p: any) => p.id === value);
        // Default to the product's selling UOM; stock is stored in base units.
        const saleUom = getSaleUom(master, unitsByProduct[value]);
        updated[idx].uom = saleUom.name;
        updated[idx].uom_factor = saleUom.factor;
        if (batches[0]) {
          const b = batches[0];
          updated[idx].inventory_id = b.id;
          updated[idx].batch_number = b.batch_number;
          updated[idx].available = toUomQty(Number(b.quantity), saleUom.factor);
          updated[idx].unit_price = (Number(b.selling_price) || Number(b.mrp) || Number(master?.selling_price) || Number(master?.mrp) || 0) / (saleUom.factor || 1);
        } else {
          updated[idx].unit_price = (Number(master?.selling_price) || Number(master?.mrp) || 0) / (saleUom.factor || 1);
        }
      }
    }
    if (field === "inventory_id") {
      const inv = pharmaInventory.find((i: any) => i.id === value) as any;
      const factor = updated[idx].uom_factor || 1;
      if (inv) {
        updated[idx].batch_number = inv.batch_number;
        // Per-batch pricing: prefer batch selling_price → batch mrp → legacy product price
        updated[idx].unit_price = (Number(inv.selling_price) || Number(inv.mrp) || Number(inv.pharma_products?.selling_price) || 0) / factor;
        updated[idx].available = toUomQty(Number(inv.quantity), factor);
      } else {
        updated[idx].batch_number = "";
        updated[idx].available = 0;
      }
    }
    if (field === "uom") {
      const master = (pharmaProducts as any[]).find((p: any) => p.id === updated[idx].product_id);
      const uom = findUom(master, unitsByProduct[updated[idx].product_id], value);
      const inv = (pharmaInventory as any[]).find((i: any) => i.id === updated[idx].inventory_id);
      const basePrice = inv
        ? (Number(inv.selling_price) || Number(inv.mrp) || Number(master?.selling_price) || Number(master?.mrp) || 0)
        : (Number(master?.selling_price) || Number(master?.mrp) || 0);
      updated[idx].uom = uom.name;
      updated[idx].uom_factor = uom.factor;
      updated[idx].unit_price = basePrice / (uom.factor || 1);
      if (inv) updated[idx].available = toUomQty(Number(inv.quantity), uom.factor);
    }
    setPharmaItems(updated);
  };

  const removePharmaItem = (idx: number) => setPharmaItems(pharmaItems.filter((_, i) => i !== idx));

  const createInvoice = useMutation({
    mutationFn: async () => {
      const services = serviceInputs.filter((s) => s.name.trim()).map((s) => s.name);
      const pharmaServiceNames = pharmaItems.filter(i => i.product_name).map(i => `${i.product_name} x${i.quantity}`);
      const allServices = [...services, ...pharmaServiceNames];
      if (allServices.length === 0) throw new Error("Add at least one service or product");

      const lineItemsSnapshot = lineItemsSnapshotFor(serviceInputs, pharmaItems);

      const patient = patients.find((p) => p.id === patientId);
      const patientName = patient ? `${patient.first_name} ${patient.last_name}` : null;
      // Settled here, not read out of state: the patient's appointments are
      // fetched when the patient is picked, and a biller who saves before that
      // returns would otherwise write appointment_id null and the visit would
      // read "No bill". See invoiceAppointmentLink.ts.
      const linkedAppointmentId = await resolveInvoiceAppointmentId({
        explicitChoice: linkAppointmentChoice,
        formValue: effectiveLinkAppointmentId,
        patientId,
        invoiceDate,
        doctorId,
        loadAppointments: fetchPatientAppointments,
      });
      // One number per invoice row, drawn from the database so the series stays
      // unbroken however many people are billing at once. Taken here, at save,
      // so an abandoned dialog does not spend one.
      const rowCount =
        paymentType === "Staged" ? stages.length : paymentType === "Recurring" ? recurringCount : 1;
      const invoiceNumbers = await allocateInvoiceNumbers(rowCount);
      const createdAt = invoiceDate ? invoiceDate.toISOString() : new Date().toISOString();
      // Per-line tax aggregation: sum cgst/sgst/igst from each service & pharma line by its own mapped rate
      const aggregateLineTax = (svcAmounts: { name: string; price: number }[], pharma: PharmaLineItem[], scale: number) => {
        let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
        svcAmounts.forEach((s) => {
          if (!s.name.trim() || !s.price) return;
          const t = getServiceLineTax(s.name, s.price * scale, (s as any).hsn);
          cgstAmount += t.cgst; sgstAmount += t.sgst; igstAmount += t.igst;
        });
        pharma.forEach((p) => {
          const amt = p.quantity * p.unit_price;
          if (!p.product_id || !amt) return;
          const t = getProductLineTax(p.product_id, amt * scale, p.inventory_id);
          cgstAmount += t.cgst; sgstAmount += t.sgst; igstAmount += t.igst;
        });
        return { cgst_amount: cgstAmount, sgst_amount: sgstAmount, igst_amount: igstAmount, tax_amount: cgstAmount + sgstAmount + igstAmount };
      };
      // For staged/recurring (which split a single user-typed amount), allocate proportionally to subtotal
      const baseSubtotal = servicesSubtotal + pharmaSubtotal;
      const splitTax = (base: number) => {
        const scale = baseSubtotal > 0 ? base / baseSubtotal : 0;
        return aggregateLineTax(serviceInputs, pharmaItems, scale);
      };

      if (paymentType === "Staged") {
        const rows = stages.map((stage, i) => {
          const t = splitTax(stage.amount);
          const stageTotal = stage.amount + t.tax_amount;
          let status = "Pending";
          if (stage.paid >= stageTotal && stageTotal > 0) status = "Paid";
          else if (stage.paid > 0) status = "Partial";
          return {
            invoice_number: invoiceNumbers[i],
            created_at: createdAt,
            patient_id: patientId || null,
            patient_name: patientName,
            services: allServices,
            line_items: lineItemsSnapshot,
            doctor_id: doctorId || null,
            // Staged rows used to save with no appointment_id at all, so every
            // stage of a treatment plan read "No bill" on the visit it paid for.
            appointment_id: linkedAppointmentId,
            total_amount: stageTotal,
            paid_amount: stage.paid,
            status,
            payment_type: "Staged",
            payment_mode: paymentMode,
            billed_by: billedBy || null,
            notes: `${stage.label}${notes ? ` — ${notes}` : ""}`,
            tax_id: null,
            tax_rate: null,
            ...t,
          };
        });
        const { error } = await supabase.from("invoices").insert(rows as any);
        if (error) throw error;
        // Return a summary for downstream WhatsApp notification
        var summary: any = {
          invoiceNumber: `${invoiceNumbers[0]} (${stages.length} stages)`,
          totalAmount: rows.reduce((s, r: any) => s + Number(r.total_amount), 0),
          paidAmount: rows.reduce((s, r: any) => s + Number(r.paid_amount), 0),
          status: "Staged plan",
          invoiceId: undefined as string | undefined,
        };
      } else if (paymentType === "Recurring") {
        // Installments cover SERVICES only; pharmacy is billed in full on the invoice charged today
        const svcScale = servicesSubtotal > 0 ? recurringAmount / servicesSubtotal : 0;
        const t = aggregateLineTax(serviceInputs, [], svcScale);
        const pharmaT = aggregateLineTax([], pharmaItems, 1);
        const totalPerInst = recurringAmount + t.tax_amount;
        const dueTodayIdx: number[] = [];
        for (let i = 0; i < recurringCount; i++) {
          if (recurringInvoiceNow[i]) dueTodayIdx.push(i);
        }
        const pharmaHostIdx = dueTodayIdx.length > 0 ? dueTodayIdx[0] : 0;
        const groupId = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`) as string;

        // Installments only get an appointment when explicitly ticked
        // ("Book a visit") - the installment count and the number of
        // scheduled visits are independent, not forced to match.
        const appointmentIds: (string | null)[] = Array.from({ length: recurringCount }, () => null);
        let parentAppt: any = null;
        if (sourceAppointmentId && recurringCreateAppt[0]) {
          const { data: pa } = await supabase.from("appointments").select("*").eq("id", sourceAppointmentId).maybeSingle();
          parentAppt = pa || null;
          appointmentIds[0] = sourceAppointmentId;
        }

        if (patientId) {
          const durationMs = parentAppt?.start_time && parentAppt?.end_time
            ? new Date(parentAppt.end_time).getTime() - new Date(parentAppt.start_time).getTime()
            : 30 * 60 * 1000;
          let parentId = appointmentIds[0];

          for (let i = 0; i < recurringCount; i++) {
            if (appointmentIds[i] || !recurringCreateAppt[i]) continue;
            const due = recurringDueDates[i] || addMonths(new Date(), i);
            const start = new Date(recurringApptDates[i] || due);
            if (parentAppt?.start_time) {
              const src = new Date(parentAppt.start_time);
              start.setHours(src.getHours(), src.getMinutes(), 0, 0);
            } else {
              start.setHours(10, 0, 0, 0);
            }
            const end = new Date(start.getTime() + durationMs);
            const basePayload: any = {
              patient_id: patientId,
              patient_name: patientName,
              service: parentAppt?.service || allServices[0] || "Installment payment",
              start_time: start.toISOString(),
              end_time: end.toISOString(),
              status: "Reserved",
              visit_status: "Recurring visit",
              staff_id: doctorId || parentAppt?.staff_id || null,
              is_recurring: true,
              parent_appointment_id: parentId,
              reason_for_consultation: `Installment ${i + 1} of ${recurringCount}`,
              appointment_type: parentAppt?.appointment_type || "Walk-in",
            };
            let inserted: any = null;
            let res = await supabase.from("appointments").insert(basePayload).select("id").single();
            if (res.error) {
              // Slot clash with the assigned doctor — book without a doctor rather than fail the plan
              res = await supabase.from("appointments").insert({ ...basePayload, staff_id: null }).select("id").single();
            }
            if (!res.error) inserted = res.data;
            appointmentIds[i] = inserted?.id || null;
            if (!parentId && inserted?.id) {
              parentId = inserted.id;
              appointmentIds[i] = inserted.id;
            }
          }
        }

        const rows = Array.from({ length: recurringCount }, (_, i) => {
          const collected = recurringCollected[i] || 0;
          const instStatus = recurringStatuses[i] || "Pending";
          const dueDate = recurringDueDates[i] || addMonths(new Date(), i);
          // Only installment #1 is invoiced today (tax charged now). Installments
          // 2..N are *scheduled amounts* — no tax is levied until they are collected
          // on/after their due date. The effective tax rate is stored so tax can be
          // applied at collection time.
          const chargedNow = dueTodayIdx.includes(i);
          const withPharma = i === pharmaHostIdx && pharmaSubtotal > 0;
          const effRate = recurringAmount > 0 ? (t.tax_amount / recurringAmount) * 100 : 0;
          const taxNow = {
            tax_amount: (chargedNow ? t.tax_amount : 0) + (withPharma ? pharmaT.tax_amount : 0),
            cgst_amount: (chargedNow ? t.cgst_amount : 0) + (withPharma ? pharmaT.cgst_amount : 0),
            sgst_amount: (chargedNow ? t.sgst_amount : 0) + (withPharma ? pharmaT.sgst_amount : 0),
            igst_amount: (chargedNow ? t.igst_amount : 0) + (withPharma ? pharmaT.igst_amount : 0),
          };
          const lineTotal = recurringAmount
            + (chargedNow ? t.tax_amount : 0)
            + (withPharma ? pharmaSubtotal + pharmaT.tax_amount : 0);
          let status = instStatus;
          if (collected >= lineTotal && lineTotal > 0) status = "Paid";
          else if (collected > 0 && instStatus === "Pending") status = "Partial";
          return {
            invoice_number: invoiceNumbers[i],
            created_at: createdAt,
            patient_id: patientId || null,
            patient_name: patientName,
            services: allServices,
            line_items: lineItemsSnapshot,
            doctor_id: doctorId || null,
            appointment_id: appointmentIds[i] || (i === 0 ? linkedAppointmentId : null),
            recurring_group_id: groupId,
            installment_number: i + 1,
            installment_count: recurringCount,
            due_date: format(dueDate, "yyyy-MM-dd"),
            total_amount: lineTotal,
            paid_amount: collected,
            status,
            payment_type: "Recurring",
            payment_mode: paymentMode,
            billed_by: billedBy || null,
            notes: `${chargedNow ? "Installment" : "Scheduled amount"} ${i + 1} of ${recurringCount} | Due: ${format(dueDate, "dd MMM yyyy")}${withPharma ? " | Includes pharmacy (paid in full)" : ""}${notes ? ` — ${notes}` : ""}`,
            tax_id: null,
            tax_rate: chargedNow ? null : Math.round(effRate * 100) / 100,
            ...taxNow,
          };
        });
        const { error } = await supabase.from("invoices").insert(rows as any);
        if (error) throw error;
        var summary: any = {
          invoiceNumber: `${invoiceNumbers[0]} (${recurringCount} installments)`,
          totalAmount: rows.reduce((s, r: any) => s + Number(r.total_amount), 0),
          paidAmount: rows.reduce((s, r: any) => s + Number(r.paid_amount), 0),
          status: "Recurring plan",
          invoiceId: undefined as string | undefined,
          isRecurring: true,
          installmentCount: recurringCount,
          installmentAmount: recurringAmount,
          firstDueDate: recurringDueDates[0] || new Date(),
          serviceName: allServices[0] || "Treatment plan",
        };
      } else {
        const combinedSubtotal = servicesSubtotal + pharmaSubtotal;
        const t = splitTax(combinedSubtotal);
        const grandTotal = combinedSubtotal + t.tax_amount;
        let status = "Pending";
        if (paidAmount >= grandTotal && grandTotal > 0) status = "Paid";
        else if (paidAmount > 0) status = "Partial";

        const splitsActive = splits.length > 0;
        const problem = splitProblem(splits, paidAmount);
        if (problem) throw new Error(problem);
        const effectivePaymentMode = paymentModeForSplits(splits, paymentMode);

        const { data: insertedInv, error } = await supabase.from("invoices").insert({
          invoice_number: invoiceNumbers[0],
          created_at: createdAt,
          patient_id: patientId || null,
          patient_name: patientName,
          services: allServices,
          line_items: lineItemsSnapshot,
          doctor_id: doctorId || null,
          appointment_id: linkedAppointmentId,
          total_amount: grandTotal,
          paid_amount: paidAmount,
          status,
          payment_type: "One-time",
          payment_mode: effectivePaymentMode,
          billed_by: billedBy || null,
          payment_splits: splitsActive ? splits : null,
          notes: notes || null,
          tax_id: null,
          tax_rate: null,
          ...t,
        } as any).select("id").single();
        if (error) throw error;
        var summary: any = {
          invoiceNumber: invoiceNumbers[0],
          totalAmount: grandTotal,
          paidAmount: paidAmount,
          status,
          invoiceId: insertedInv?.id as string | undefined,
        };
      }

      for (const item of pharmaItems) {
        if (item.inventory_id && item.quantity > 0) {
          const invRecord = pharmaInventory.find((inv: any) => inv.id === item.inventory_id) as any;
          if (invRecord) {
            const baseQty = toBaseQty(item.quantity, item.uom_factor || 1);
            await supabase.from("pharma_inventory").update({
              quantity: Math.max(0, Number(invRecord.quantity) - baseQty)
            }).eq("id", item.inventory_id);
          }
        }
      }

      // Lookup patient phone for WhatsApp notification
      let patientPhone: string | null = null;
      if (patientId) {
        const { data: pdata } = await supabase
          .from("patients")
          .select("phone")
          .eq("id", patientId)
          .maybeSingle();
        patientPhone = (pdata as any)?.phone ?? null;
      }

      return { summary, patientPhone, patientName };
    },
    onSuccess: async (result: any) => {
      invalidateInvoices();
      queryClient.invalidateQueries({ queryKey: ["pharma-inventory-billing"] });
      queryClient.invalidateQueries({ queryKey: ["pharma-inventory"] });
      const msg = paymentType === "Staged" ? `${stages.length} staged invoices created` : paymentType === "Recurring" ? `${recurringCount} recurring invoices created` : "Invoice created";
      toast.success(msg);

      // The invoice is NOT sent automatically any more - front-desk staff
      // review it first and press "Send via WhatsApp" on the invoice.
      resetForm();
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Background: generate PDF and send WhatsApp without blocking the UI.
  const dispatchInvoiceWhatsApp = async (result: any) => {
    try {
      if (!result?.patientPhone || !result?.patientName || !result?.summary) return;
      const balance = Math.max(0, Number(result.summary.totalAmount) - Number(result.summary.paidAmount));

      // Recurring plan — single dedicated template, no PDF needed
      if (result.summary.isRecurring) {
        const due = result.summary.firstDueDate
          ? format(new Date(result.summary.firstDueDate), "dd MMM yyyy")
          : "";
        const { error: rWaErr } = await supabase.functions.invoke(
          "send-recurring-invoice-whatsapp",
          {
            body: {
              phone: result.patientPhone,
              patientName: result.patientName,
              serviceName: result.summary.serviceName,
              totalAmount: Number(result.summary.totalAmount).toLocaleString("en-IN"),
              installmentCount: String(result.summary.installmentCount),
              installmentAmount: Number(result.summary.installmentAmount).toLocaleString("en-IN"),
              firstDueDate: due,
            },
          },
        );
        if (rWaErr) console.error("Recurring WhatsApp send failed:", rWaErr);
        else toast.success("WhatsApp recurring plan sent to patient");
        return;
      }

      // Generate the PDF FIRST and wait for it, so the WhatsApp template link
      // (and the attached media) point at a document that already exists.
      let invoiceUrl: string | null = null;
      if (result.summary.invoiceId) {
        const { data: pdfData, error: pdfErr } = await supabase.functions.invoke("generate-invoice-pdf", {
          body: { invoiceId: result.summary.invoiceId, wait: true },
        });
        if (pdfErr) console.error("Invoice PDF generation failed:", pdfErr);
        invoiceUrl = (pdfData as any)?.url ?? null;
      }

      const { data: waData, error: waErr } = await supabase.functions.invoke("send-invoice-whatsapp", {
        body: {
          phone: result.patientPhone,
          patientName: result.patientName,
          invoiceNumber: result.summary.invoiceNumber,
          totalAmount: Number(result.summary.totalAmount).toLocaleString("en-IN"),
          paidAmount: Number(result.summary.paidAmount).toLocaleString("en-IN"),
          balanceAmount: balance.toLocaleString("en-IN"),
          status: result.summary.status,
          invoiceUrl,
        },
      });

      if (waErr) {
        console.error("WhatsApp invoice send failed:", waErr);
        toast.error("WhatsApp invoice could not be sent");
      } else if ((waData as any)?.deliveryError) {
        const de = (waData as any).deliveryError;
        console.error("WhatsApp delivery error:", de);
        toast.error(`WhatsApp not delivered (Twilio ${de.code})`);
      } else {
        toast.success("WhatsApp invoice sent to patient");
      }
    } catch (e) {
      console.error("dispatchInvoiceWhatsApp error:", e);
    }
  };

  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  /** Explicit "Send via WhatsApp" for a saved invoice - never fires on its own. */
  const sendInvoiceWhatsApp = async (inv: any) => {
    if (!inv?.id) return;
    setSendingWhatsApp(true);
    const t = toast.loading("Sending invoice on WhatsApp…");
    try {
      let phone: string | null = null;
      if (inv.patient_id) {
        const { data: pdata } = await supabase.from("patients").select("phone").eq("id", inv.patient_id).maybeSingle();
        phone = (pdata as any)?.phone ?? null;
      }
      if (!phone) {
        toast.dismiss(t);
        toast.error("This patient has no phone number on file");
        return;
      }
      await dispatchInvoiceWhatsApp({
        patientPhone: phone,
        patientName: inv.patient_name || "Patient",
        summary: {
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          totalAmount: Number(inv.total_amount) || 0,
          paidAmount: Number(inv.paid_amount) || 0,
          status: inv.status,
          isRecurring: false,
        },
      });
      toast.dismiss(t);
    } finally {
      setSendingWhatsApp(false);
      toast.dismiss(t);
    }
  };


  // Helper: when a recurring installment invoice flips to Paid,
  // generate a PDF for that specific installment and send it via WhatsApp
  // using the existing invoice template. Plain numbers are sent (₹ lives
  // in the Twilio template).
  const notifyInstallmentPaid = async (invoiceId: string) => {
    try {
      const { data: inv } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .maybeSingle();
      if (!inv) return;
      // Only fire for recurring installments
      if ((inv as any).payment_type !== "Recurring") return;

      let phone: string | null = null;
      if ((inv as any).patient_id) {
        const { data: p } = await supabase
          .from("patients")
          .select("phone")
          .eq("id", (inv as any).patient_id)
          .maybeSingle();
        phone = (p as any)?.phone ?? null;
      }
      if (!phone) return;

      const total = Number((inv as any).total_amount) || 0;
      const paid = Number((inv as any).paid_amount) || 0;
      const balance = Math.max(0, total - paid);

      // Generate the PDF first so the WhatsApp link/attachment resolves.
      const { data: pdfData, error: pdfErr } = await supabase.functions.invoke("generate-invoice-pdf", {
        body: { invoiceId, wait: true },
      });
      if (pdfErr) console.error("Installment PDF generation error:", pdfErr);

      const { data: waData, error: waErr } = await supabase.functions.invoke("send-invoice-whatsapp", {
        body: {
          phone,
          patientName: (inv as any).patient_name,
          invoiceNumber: (inv as any).invoice_number,
          totalAmount: total.toLocaleString("en-IN"),
          paidAmount: paid.toLocaleString("en-IN"),
          balanceAmount: balance.toLocaleString("en-IN"),
          status: (inv as any).status,
          invoiceUrl: (pdfData as any)?.url ?? null,
        },
      });
      if (waErr) console.error("Installment WhatsApp send failed:", waErr);
      else if ((waData as any)?.deliveryError) {
        console.error("WhatsApp delivery error:", (waData as any).deliveryError);
        toast.error(`WhatsApp not delivered (Twilio ${(waData as any).deliveryError.code})`);
      } else toast.success("Installment invoice sent to patient");

    } catch (e) {
      console.error("notifyInstallmentPaid error:", e);
    }
  };

  const updatePayment = useMutation({
    mutationFn: async () => {
      if (!paymentInv) return;
      const newPaid = Number(paymentInv.paid_amount) + addPaymentAmount;
      const total = Number(paymentInv.total_amount);
      let status = "Partial";
      if (newPaid >= total) status = "Paid";
      else if (newPaid <= 0) status = "Pending";

      const { data: written, error } = await supabase.from("invoices").update({
        paid_amount: Math.min(newPaid, total),
        status,
        payment_mode: addPaymentMode,
      }).eq("id", paymentInv.id).select("id");
      if (error) throw error;
      assertWrote(written);
      return { invoiceId: paymentInv.id, becamePaid: status === "Paid" && paymentInv.status !== "Paid" };
    },
    onSuccess: async (res: any) => {
      invalidateInvoices();
      toast.success("Payment updated");
      if (res?.becamePaid && res.invoiceId) {
        void notifyInstallmentPaid(res.invoiceId);
      }
      setPaymentInv(null);
      setAddPaymentAmount(0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const markAsPaid = useMutation({
    mutationFn: async (inv: any) => {
      const { data: written, error } = await supabase.from("invoices").update({
        paid_amount: inv.total_amount,
        status: "Paid",
      }).eq("id", inv.id).select("id");
      if (error) throw error;
      assertWrote(written);
      return { invoiceId: inv.id, becamePaid: inv.status !== "Paid" };
    },
    onSuccess: async (res: any) => {
      invalidateInvoices();
      toast.success("Invoice marked as paid");
      if (res?.becamePaid && res.invoiceId) {
        await notifyInstallmentPaid(res.invoiceId);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateInvoiceStatus = useMutation({
    mutationFn: async ({ id, status, prevStatus }: { id: string; status: string; prevStatus?: string }) => {
      const updates: any = { status };
      // If marking Paid, also set paid_amount to total so totals stay consistent
      if (status === "Paid") {
        const { data: invRow } = await supabase.from("invoices").select("total_amount").eq("id", id).maybeSingle();
        if (invRow) updates.paid_amount = Number((invRow as any).total_amount) || 0;
      }
      const { data: written, error } = await supabase.from("invoices").update(updates).eq("id", id).select("id");
      if (error) throw error;
      assertWrote(written);
      return { invoiceId: id, becamePaid: status === "Paid" && prevStatus !== "Paid" };
    },
    onSuccess: async (res: any) => {
      invalidateInvoices();
      toast.success("Status updated");
      if (res?.becamePaid && res.invoiceId) {
        await notifyInstallmentPaid(res.invoiceId);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Cancelling an invoice keeps the row (and its invoice_number) in place
  // instead of hard-deleting it, so the number never disappears from the
  // sequence or from Reports - a required reason is captured for audit.
  const cancelInvoice = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { data: written, error } = await supabase.from("invoices").update({
        status: "Cancelled",
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by_name: userData?.user?.email || null,
      } as any).eq("id", id).select("id");
      if (error) throw error;
      assertWrote(written);
    },
    onSuccess: () => {
      invalidateInvoices();
      toast.success("Invoice cancelled");
      setViewInvoice(null);
      setIsEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateInvoice = useMutation({
    mutationFn: async () => {
      if (!viewInvoice) return;
      // While rows are active they ARE the payment, so the paid amount is their
      // total - the create form does the same, and a figure that disagreed with
      // the rows beneath it would be the fault this is here to end.
      const newPaid = splits.length > 0 ? splitTotal(splits) : Number(editData.paid_amount);
      const problem = splitProblem(splits, newPaid);
      if (problem) throw new Error(problem);
      // A saved bill must keep its patient. Clearing the picker here would
      // write patient_id null and the bill would vanish from that patient's
      // Invoices tab while still showing in Billing - the fault this change
      // exists to end.
      if (!String(editData.patient_id ?? "").trim()) {
        throw new Error("Choose the patient this bill belongs to before saving.");
      }

      // What the form now holds. Built by the same snapshot the create path
      // writes, so an edited invoice is shaped exactly like a new one.
      const editedLines = lineItemsSnapshotFor(serviceInputs, pharmaItems);
      // Renaming a line is not repricing it. Now that a name can be typed,
      // correcting a spelling would otherwise re-resolve the GST from today's
      // Tax Master and could flip a Paid invoice to Partial - see
      // invoiceLineChanges.ts.
      const changed = invoiceLineChanges(
        JSON.parse(editedLinesOriginal.current.lineItems) as unknown[],
        editedLines as unknown[],
      );

      // Untouched lines are left completely alone. Recomputing on every save
      // would rewrite 46,936 imported invoices the first time anyone opened
      // one, and those already match Salesforce to the rupee.
      const newTotal = changed.money ? linesGrandTotal : Number(viewInvoice.total_amount);
      let status = "Pending";
      if (newPaid >= newTotal && newTotal > 0) status = "Paid";
      else if (newPaid > 0) status = "Partial";

      const billedChanges = changed.lines
        ? {
            line_items: editedLines,
            services: serviceInputs.filter((s) => s.name.trim()).map((s) => s.name.trim()),
            // Only when what was charged moved. A corrected name leaves the
            // bill's own figures exactly as they were.
            ...(changed.money
              ? {
                  cgst_amount: lineTaxRows.reduce((sum, r) => sum + r.cgst, 0),
                  sgst_amount: lineTaxRows.reduce((sum, r) => sum + r.sgst, 0),
                  igst_amount: lineTaxRows.reduce((sum, r) => sum + r.igst, 0),
                  tax_amount: lineTaxTotal,
                }
              : {}),
          }
        : {};

      const { data: written, error } = await supabase.from("invoices").update({
        patient_name: editData.patient_name,
        patient_id: editData.patient_id || null,
        doctor_id: editData.doctor_id || null,
        total_amount: newTotal,
        paid_amount: newPaid,
        // Derived from the rows, the same way a new bill derives it, so an
        // edited invoice is shaped like one that was just created - and the
        // mode can never say "Cash" above two payments that say otherwise.
        payment_mode: paymentModeForSplits(splits, editData.payment_mode),
        payment_splits: splits.length > 0 ? splits : null,
        payment_type: editData.payment_type,
        billed_by: editData.billed_by || null,
        notes: editData.notes || null,
        appointment_id: editData.appointment_id || null,
        status,
        ...billedChanges,
      }).eq("id", viewInvoice.id).select("id");
      if (error) throw error;
      assertWrote(written);

      // Stock follows the change: what was taken off the shelf when this
      // invoice was raised comes back, and what it now bills goes out. Rows
      // whose total did not move are not written at all.
      if (changed.lines) {
        const delta = stockDelta(
          editedLinesOriginal.current.products,
          pharmaItems.map((p) => ({ inventory_id: p.inventory_id, quantity: p.quantity, uom_factor: p.uom_factor || 1 })),
        );
        for (const [inventoryId, amount] of Object.entries(delta)) {
          const row = inventoryRow(inventoryId);
          if (!row) continue;
          await supabase.from("pharma_inventory")
            .update({ quantity: Math.max(0, Number(row.quantity) + amount) })
            .eq("id", inventoryId);
        }
      }
      return {
        invoiceId: viewInvoice.id,
        becamePaid: status === "Paid" && viewInvoice.status !== "Paid",
      };
    },
    onSuccess: async (res: any) => {
      invalidateInvoices();
      toast.success("Invoice updated");
      if (res?.becamePaid && res.invoiceId) {
        await notifyInstallmentPaid(res.invoiceId);
      }
      setIsEditing(false);
      setViewInvoice(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const addServiceInput = () => setServiceInputs([...serviceInputs, { name: "", price: 0, hsn: "", gst: 0 }]);
  const updateServiceInput = (i: number, patch: Partial<{ name: string; price: number; hsn: string; gst: number; service_id?: string; material_percent?: string }>) => {
    setServiceInputs((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const removeServiceInput = (i: number) => setServiceInputs(serviceInputs.filter((_, idx) => idx !== i));

  // Doctor selection: maintain a single auto "Consultation - Dr. X" line item
  // Choosing a doctor no longer bills a consultation.
  //
  // It used to add a "Consultation - Dr X" row automatically, priced from the
  // Staff Master, and the row's remove button was disabled so nobody could
  // take it off. The clinic's instruction is that no consultation line should
  // appear by default for any doctor - they add one from the Service Master
  // when they mean to. Any row left over from the old behaviour is stripped.
  const handleDoctorChange = (newDoctorId: string) => {
    setDoctorId(newDoctorId);
    setServiceInputs((prev) => (prev.length > 0 ? prev : [{ name: "", price: 0, hsn: "", gst: 0 }]));
  };

  const addStage = () => setStages([...stages, { label: `Stage ${stages.length + 1}`, amount: 0, paid: 0 }]);
  const updateStage = (i: number, field: keyof StageRow, value: string | number) => {
    const updated = [...stages];
    (updated[i] as any)[field] = value;
    setStages(updated);
  };
  const removeStage = (i: number) => setStages(stages.filter((_, idx) => idx !== i));

  const canCreateInvoice = () => {
    const hasServices = serviceInputs.some(s => s.name.trim());
    const hasPharma = pharmaItems.some(i => i.product_id && i.quantity > 0 && i.unit_price > 0);
    const hasLineItems = hasServices || hasPharma;
    const amountIsPositive =
      paymentType === "Staged" ? stages.some((s) => s.amount > 0)
      : paymentType === "Recurring" ? recurringCount > 0 && recurringAmount > 0
      : (servicesSubtotal + pharmaSubtotal) > 0;
    // The patient and whoever raised it are both part of being saveable.
    // Without the first, Save was live with the patient box empty and the bill
    // went in unlinked - see invoiceFormState.ts, which also says why the name
    // is required here rather than by the column.
    return invoiceCanBeSaved({ patientId, billedBy, hasLineItems, amountIsPositive });
  };

  // All-time totals, independent of pagination/filters/search - fetched
  // separately (3 columns, no join) so a hiccup here never blanks the main
  // invoice list, which no longer depends on this query.
  const { data: invoiceStats, isLoading: statsLoading } = useQuery({
    queryKey: ["invoice-stats"],
    queryFn: fetchInvoiceStats,
  });
  const totalRevenue = invoiceStats?.totalRevenue ?? 0;
  const pendingAmount = invoiceStats?.pendingAmount ?? 0;
  const partialAmount = invoiceStats?.partialAmount ?? 0;
  const pendingCount = invoiceStats?.pendingCount ?? 0;
  const partialCount = invoiceStats?.partialCount ?? 0;

  // Full-text search + filters - a plain function (not memoized itself) so
  // exportCSV can reuse the exact same predicate against a freshly-fetched
  // export dataset, not just the invoices currently held in state.
  const matchesQuickFilters = (inv: any) => {
    const q = search.toLowerCase();
    if (q) {
      const drName = getDrName(inv, staffById).toLowerCase();
      const patientName = getPatientName(inv, patientById).toLowerCase();
      const servicesStr = (inv.services || []).join(" ").toLowerCase();
      const searchFields = [
        inv.invoice_number,
        patientName,
        servicesStr,
        inv.payment_type,
        inv.payment_mode,
        drName,
      ].join(" ").toLowerCase();
      if (!searchFields.includes(q)) return false;
    }

    // Date filter
    if (filterDateFrom || filterDateTo) {
      const invDate = new Date(inv.created_at);
      if (filterDateFrom && invDate < startOfDay(filterDateFrom)) return false;
      if (filterDateTo && invDate > endOfDay(filterDateTo)) return false;
    }

    // Doctor filter
    if (filterDoctor) {
      const staffId = inv.appointments?.staff_id || inv.doctor_id;
      if (staffId !== filterDoctor) return false;
    }

    // Service filter
    if (filterService) {
      if (!(inv.services || []).some((s: string) => s === filterService)) return false;
    }

    // Type filter
    if (filterType && inv.payment_type !== filterType) return false;

    // Status filter
    if (filterStatus && inv.status !== filterStatus) return false;

    return true;
  };

  const filtered = useMemo(() => {
    return invoices.filter(matchesQuickFilters);
  }, [invoices, search, filterDateFrom, filterDateTo, filterDoctor, filterService, filterType, filterStatus, staffById, patientById]);

  const clearFilters = () => {
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
    setFilterDoctor("");
    setFilterService("");
    setFilterType("");
    setFilterStatus("");
  };

  // CSV Export
  const exportCSV = async () => {
    // In default (server-paginated) mode `invoices`/`viewFiltered` only
    // hold the current page - export needs the full matching set, so fetch
    // it fresh (scoped by the date filter, if any) rather than exporting
    // just what happens to be on-screen.
    let exportSet: any[];
    if (needsClientRows) {
      exportSet = viewFiltered;
    } else {
      toast.loading("Preparing export…", { id: "export-csv" });
      try {
        const all = await fetchInvoicesInRange({ dateFrom: filterDateFrom, dateTo: filterDateTo });
        exportSet = applyViewFilters(all.filter(matchesQuickFilters));
      } catch (err: any) {
        toast.error(`Export failed: ${err.message}`, { id: "export-csv" });
        return;
      }
    }

    const headers = ["Invoice", "Date", "Patient", "Doctor", "Services", "Type", "Mode", "Total", "Paid", "Balance", "Status"];
    const rows = exportSet.map((inv: any) => [
      inv.invoice_number,
      displayDate(inv.created_at),
      getPatientName(inv, patientById),
      getDrName(inv, staffById),
      displayServices(inv).join("; "),
      inv.payment_type,
      // The named instruments, not the bare word "Split", which told a reader
      // nothing about what was actually taken.
      paymentModeLabel(inv),
      Number(inv.total_amount),
      Number(inv.paid_amount),
      Number(inv.total_amount) - Number(inv.paid_amount),
      inv.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    // The byte order mark is what tells Excel the file is UTF-8; without it a
    // rupee sign or an accented name arrives as mojibake.
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${exportSet.length} invoices`, { id: "export-csv" });
  };

  const stagedTotal = stages.reduce((s, st) => s + st.amount, 0);
  const stagedPaid = stages.reduce((s, st) => s + st.paid, 0);
  const recurringTotal = recurringCount * recurringAmount;
  const recurringPaidTotal = recurringCollected.reduce((s, c) => s + c, 0);

  const openViewSheet = (inv: any) => {
    setViewInvoice(inv);
    setIsEditing(false);
    setEditData({
      patient_name: getPatientName(inv, patientById),
      patient_id: inv.patient_id || "",
      doctor_id: inv.doctor_id || "",
      total_amount: inv.total_amount,
      paid_amount: inv.paid_amount,
      payment_mode: inv.payment_mode || "Cash",
      payment_type: inv.payment_type || "One-time",
      notes: inv.notes || "",
      appointment_id: inv.appointment_id || "",
      // Carried into the form so saving an edit cannot blank it.
      billed_by: inv.billed_by || "",
    });
  };

  /**
   * Edit Invoice, loaded into the form that made it.
   *
   * The services and products go into the very same state the create form
   * drives, so the totals, the tax split and the stored snapshot are all
   * computed by code that already exists rather than a second implementation
   * that could disagree with it. The originals are kept so the save can tell
   * whether the lines were actually touched, and so pharmacy stock can be
   * reconciled against what was taken off the shelf when the invoice was
   * raised.
   */
  const inventoryRow = (id: string): { id: string; quantity: number } | undefined =>
    (pharmaInventory as { id: string; quantity: number }[]).find((r) => r.id === id);

  const startEditingInvoice = (inv: { line_items?: unknown; payment_splits?: unknown }) => {
    const seeded = seedInvoiceLines(inv?.line_items);
    // The split rows this bill was actually paid with. Cleared when it has none,
    // because `splits` is shared with the create form - the rows left over from
    // the last bill someone raised would otherwise turn up on this one.
    setSplits(splitsFromInvoice(inv?.payment_splits));
    setServiceInputs(seeded.services.length ? seeded.services : [{ name: "", price: 0, hsn: "", gst: 0 }]);
    setPharmaItems(
      seeded.products.map((p) => ({
        ...p,
        // What is left on the shelf now, so the quantity field can still warn
        // about overselling while the invoice is being corrected.
        available: Number(inventoryRow(p.inventory_id)?.quantity) || 0,
      })),
    );
    editedLinesOriginal.current = {
      // Baseline must be the SAME snapshot shape the save path compares
      // against (lineItemsSnapshotFor of the seeded form state), not the raw
      // stored JSON. Stored lines predate the current snapshot shape (no
      // `kind`, different key set/order), so comparing against them made
      // linesChanged true on every edit of an existing bill - which then
      // rewrote the total, tax and pharmacy stock from a recompute nobody
      // asked for.
      lineItems: JSON.stringify(lineItemsSnapshotFor(seeded.services, seeded.products)),
      products: seeded.products.map((p) => ({ inventory_id: p.inventory_id, quantity: p.quantity, uom_factor: p.uom_factor })),
    };
    setIsEditing(true);
  };

  // Get columns to display based on active saved view or default
  const displayColumns = activeView?.columns?.length ? activeView.columns : DEFAULT_BILLING_FIELDS;

  // Check if a column should be displayed
  const shouldShowColumn = (column: string) => displayColumns.includes(column);

  // Denormalize an invoice into the flat shape BILLING_VIEW_FIELDS' filter
  // engine reads.
  const toViewRow = (inv: any) => ({
    id: inv.id,
    invoice_number: inv.invoice_number || "",
    patient_name: getPatientName(inv, patientById),
    total_amount: Number(inv.total_amount) || 0,
    paid_amount: Number(inv.paid_amount) || 0,
    status: inv.status || "",
    payment_mode: inv.payment_mode || "",
    created_at: inv.created_at,
  });

  // Apply the active saved view's filters (if any)
  function applyViewFilters(items: any[]) {
    if (!activeView?.filters?.conditions?.length) return items;
    const denormalized = items.map(toViewRow);
    const kept = new Set(applyListFilters(denormalized, activeView.filters, BILLING_VIEW_FIELDS).map((r) => r.id));
    return items.filter((inv) => kept.has(inv.id));
  }

  // Apply custom view filters (helpers above are hoisted function declarations)
  const viewFiltered = applyViewFilters(filtered);

  // In the default (server-paginated) mode, `invoices` is already exactly
  // one page, sized/counted by the server - no further client slicing.
  // In needsClientRows mode, keep paginating the bounded, client-filtered
  // `viewFiltered` set exactly as before.
  const total = needsClientRows ? viewFiltered.length : pagedData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedInvoices = needsClientRows
    ? viewFiltered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
    : invoices;

  /**
   * The Payment Mode control, for both forms.
   *
   * Edit Invoice used to carry its own, offering a mode list with no "Split" in
   * it - so a split bill opened with the box blank and no way to change either
   * amount. Rendered from one place now, the way the Services and Pharmacy
   * blocks below already are, so the two cannot drift apart again.
   *
   * `mode`/`onMode` differ between the forms (paymentMode here,
   * editData.payment_mode there); the split rows are the shared `splits` state.
   */
  const renderPaymentMode = (mode: string, onMode: (v: string) => void, allowSplit: boolean) => (
    <div>
      <div className="flex items-center justify-between">
        <Label>Payment Mode</Label>
        {allowSplit && (
          splits.length === 0 ? (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setSplits([{ mode: mode || "Cash", amount: 0 }, { mode: "UPI", amount: 0 }])}
            >
              + Split Payment
            </button>
          ) : (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline"
              onClick={() => setSplits([])}
            >
              Use single mode
            </button>
          )
        )}
      </div>
      {splits.length === 0 ? (
        <Select value={mode} onValueChange={onMode}>
          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <div className="mt-1.5 space-y-2">
          {splits.map((row, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <Select
                value={row.mode}
                onValueChange={(v) => setSplits(splits.map((r, i) => (i === idx ? { ...r, mode: v } : r)))}
              >
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="number"
                placeholder="Amount"
                className="w-28"
                value={row.amount || ""}
                onChange={(e) =>
                  setSplits(splits.map((r, i) => (i === idx ? { ...r, amount: parseFloat(e.target.value) || 0 } : r)))
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => setSplits(splits.filter((_, i) => i !== idx))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {splits.length < 3 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => setSplits([...splits, { mode: "Cash", amount: 0 }])}
            >
              + Add row
            </button>
          )}
          <div className="text-xs text-muted-foreground">
            Split total {formatMoney(splitTotalAmount)} — auto-applied as Paid Amount
          </div>
        </div>
      )}
    </div>
  );

  // Hoisted so Edit Invoice renders the same Services and Pharmacy blocks the
  // create form does, rather than a second, thinner form that could drift
  // from it - which is how Edit ended up unable to change what was billed.
  // A JSX const, not a component: no props to thread through, and no risk of
  // React remounting the inputs and losing what someone is typing.
  const serviceAndProductSections = (
    <>
              {/* Services */}
              <div className="rounded-xl border-2 border-accent-foreground/20 bg-accent/40 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-foreground/10 text-accent-foreground">
                      <Stethoscope className="h-4 w-4" />
                    </span>
                    <div>
                      <Label className="text-sm font-semibold">Services</Label>
                      <p className="text-[11px] text-muted-foreground">Treatments & consultations billed with this invoice</p>
                    </div>
                    {serviceInputs.filter((s) => s.name?.trim()).length > 0 && (
                      <Badge variant="secondary" className="ml-1">{serviceInputs.filter((s) => s.name?.trim()).length}</Badge>
                    )}
                  </div>
                  <Button type="button" size="sm" className="h-8 text-xs shadow-sm" onClick={addServiceInput}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Service
                  </Button>
                </div>
                <div className="hidden sm:flex gap-2 items-center px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <span className="flex-1">Service</span>
                  <span className="w-24 shrink-0 text-right">Price (₹)</span>
                  <span className="w-24 shrink-0">HSN</span>
                  {serviceInputs.length > 1 && <span className="w-8 shrink-0" />}
                </div>
                {serviceInputs.map((s, i) => (
                  <div key={i} className="mb-2">
                    <div className="flex gap-2 items-center">
                      {/* The name is typed, not only picked. A billed line was
                          read-only once saved: the one text box here appeared
                          only for an "Others" row, and a row loaded from a
                          saved bill never is one, so a name could not be
                          corrected at all. The master list stays, on the
                          chevron, and still fills price, HSN, GST and material
                          % when a service is chosen. Typing makes the line a
                          one-off - which 1,466 of the 1,480 names billed this
                          year already are. */}
                      <Popover modal open={serviceSearchOpen === i} onOpenChange={(open) => setServiceSearchOpen(open ? i : null)}>
                        <PopoverAnchor asChild>
                          <div className="relative w-full">
                            <Input
                              className="h-10 pr-9"
                              placeholder="Service / procedure name"
                              value={s.name}
                              onChange={(e) =>
                                updateServiceInput(i, {
                                  name: e.target.value,
                                  // Not the master's service any more, once the
                                  // name is somebody's own.
                                  ...(s.service_id && s.service_id !== OTHERS_VALUE
                                    ? { service_id: undefined }
                                    : {}),
                                })
                              }
                            />
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label="Choose from Service Master"
                                className="absolute right-0 top-0 h-10 w-9 px-0 text-muted-foreground hover:bg-transparent"
                              >
                                <ChevronsUpDown className="h-4 w-4 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                          </div>
                        </PopoverAnchor>
                        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search services..." />
                            <CommandList className="max-h-64 overflow-y-auto overscroll-contain" style={{ scrollbarGutter: "stable" }}>
                              <CommandEmpty>No service found.</CommandEmpty>

                              <CommandGroup>
                                {serviceMaster.map((svc: any) => (
                                  <CommandItem key={svc.id} value={svc.name} onSelect={() => {
                                    updateServiceInput(i, {
                                      name: svc.name,
                                      price: Number(svc.price) || 0,
                                      hsn: liveHsn(svc.hsn_code, activeCodes),
                                      gst: Number(svc.gst_percent) || 0,
                                      service_id: svc.id,
                                      material_percent:
                                        svc.material_percent === null || svc.material_percent === undefined
                                          ? ""
                                          : String(svc.material_percent),
                                    });
                                    setServiceSearchOpen(null);
                                  }}>
                                    <Check className={cn("mr-2 h-4 w-4", s.name === svc.name ? "opacity-100" : "opacity-0")} />
                                    <span>{svc.name}</span>
                                    <span className="ml-auto text-xs text-muted-foreground">₹{svc.price}</span>
                                  </CommandItem>
                                ))}
                                <CommandItem value="Others" onSelect={() => {
                                  updateServiceInput(i, { name: "", price: 0, hsn: "", gst: 0, service_id: OTHERS_VALUE });
                                  setServiceSearchOpen(null);
                                }}>
                                  <Check className={cn("mr-2 h-4 w-4", s.service_id === OTHERS_VALUE ? "opacity-100" : "opacity-0")} />
                                  <span>Others (type manually)</span>
                                </CommandItem>
                              </CommandGroup>
                            </CommandList>

                          </Command>
                        </PopoverContent>
                      </Popover>
                      <Input
                        type="number"
                        className="h-10 w-24 shrink-0 text-right"
                        placeholder="₹ Price"
                        value={s.price || ""}
                        onChange={(e) => updateServiceInput(i, { price: parseFloat(e.target.value) || 0 })}
                      />
                      <SearchableSelect
                        className="h-10 w-28 shrink-0"
                        placeholder="HSN"
                        searchPlaceholder="Search HSN…"
                        emptyText="No HSN codes"
                        value={s.hsn || ""}
                        onChange={(v) => updateServiceInput(i, { hsn: v })}
                        options={hsnOptions}
                      />
                      {serviceInputs.length > 1 && (
                        <Button type="button" variant="ghost" size="sm" className="text-destructive text-xs shrink-0 w-8 px-0" onClick={() => removeServiceInput(i)}>✕</Button>
                      )}
                    </div>
                    {/* Filled from the Service Master when a service is picked, typed in
                        for a one-off. Recorded on the line itself so a bill raised by
                        hand - which is most of them - carries its own figure rather than
                        depending on a master entry whose name happens to match. It never
                        reaches the invoice: invoiceLineRows builds a fixed shape that both
                        the on-screen invoice and the printed one render from, and
                        generate-invoice-pdf maps only name/qty/price/hsn/gst. */}
                    {(s.name.trim() || s.service_id) && (
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground shrink-0">Material cost</span>
                        <div className="relative w-24">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            inputMode="decimal"
                            className="h-8 pr-6 text-xs"
                            placeholder="e.g. 20"
                            value={numVal(s.material_percent)}
                            onChange={(e) => updateServiceInput(i, { material_percent: e.target.value })}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground pointer-events-none">%</span>
                        </div>
                        <span className="text-[11px] text-muted-foreground">Internal only — not shown on the invoice.</span>
                      </div>
                    )}
                    {s.price > 0 && (() => {
                      const lineTax = getServiceLineTax(s.name, s.price, (s as any).hsn);
                      return (
                        <div className="text-xs text-muted-foreground text-right pr-7 mt-0.5">
                          {lineTax.sgst > 0
                            ? `CGST ${rateLabel((lineTax.cgst / (s.price || 1)) * 100)}% + SGST ${rateLabel((lineTax.sgst / (s.price || 1)) * 100)}% = Tax (${rateLabel(lineTax.rate)}%): ${money(lineTax.taxAmount)}`
                            : lineTax.igst > 0
                            ? `IGST ${rateLabel((lineTax.igst / (s.price || 1)) * 100)}% = Tax (${rateLabel(lineTax.rate)}%): ${money(lineTax.taxAmount)}`
                            : "No tax"}
                        </div>
                      );
                    })()}
                  </div>
                ))}
                {servicesSubtotal > 0 && (
                  <div className="mt-2 flex items-center justify-between rounded-lg border border-accent-foreground/20 bg-background/70 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Services total</span>
                    <span className="text-sm font-semibold">
                      {money(servicesSubtotal)}
                      <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                        incl. tax {money(servicesSubtotal + lineTaxRows.filter((r) => r.kind === "Service").reduce((s, r) => s + r.tax, 0))}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Pharma Products */}
              <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Pill className="h-4 w-4" />
                    </span>
                    <div>
                      <Label className="text-sm font-semibold">Pharmacy</Label>
                      <p className="text-[11px] text-muted-foreground">Medicines & products billed with this invoice</p>
                    </div>
                    {pharmaItems.length > 0 && (
                      <Badge variant="secondary" className="ml-1">{pharmaItems.length}</Badge>
                    )}
                  </div>
                  <Button type="button" size="sm" className="h-8 text-xs shadow-sm" onClick={addPharmaItem}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add Product
                  </Button>
                </div>
                {pharmaItems.length === 0 && (
                  <div className="rounded-lg border border-dashed border-primary/40 bg-background/60 px-3 py-4 text-center">
                    <p className="text-xs text-muted-foreground">No pharmacy products added yet — use <span className="font-medium text-foreground">Add Product</span> to bill medicines.</p>
                  </div>
                )}
                {pharmaItems.map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-3 mb-2 space-y-2 bg-background">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Product</Label>
                        <Select value={item.product_id || "placeholder"} onValueChange={(v) => updatePharmaItem(idx, "product_id", v === "placeholder" ? "" : v)}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Select product" /></SelectTrigger>
                          <SelectContent>
                            {pharmaProductOptions.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                            <SelectItem value={OTHERS_VALUE}>Others (type manually)</SelectItem>
                          </SelectContent>
                        </Select>
                        {item.product_id === OTHERS_VALUE && (
                          <Input
                            className="mt-1"
                            placeholder="Medicine / product name"
                            value={item.product_name}
                            onChange={(e) => updatePharmaItem(idx, "product_name", e.target.value)}
                          />
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Batch</Label>
                        <Select
                          value={item.inventory_id || "placeholder"}
                          onValueChange={(v) => updatePharmaItem(idx, "inventory_id", v === "placeholder" ? "" : v)}
                          disabled={!item.product_id || item.product_id === OTHERS_VALUE}
                        >
                          <SelectTrigger className="mt-1"><SelectValue placeholder={item.product_id === OTHERS_VALUE ? "No batch" : item.product_id ? "No batch" : "Select product first"} /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="placeholder">No batch</SelectItem>
                            {(pharmaInventory as any[])
                              .filter((i: any) => i.product_id === item.product_id && i.quantity > 0 && new Date(i.expiry_date) > new Date())
                              .map((i: any) => (
                                <SelectItem key={i.id} value={i.id}>
                                  {i.batch_number} · {fmtQty(toUomQty(Number(i.quantity), item.uom_factor || 1))} {item.uom || ""} left
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <Label className="text-xs">UOM</Label>
                        <Select
                          value={item.uom || ""}
                          onValueChange={(v) => updatePharmaItem(idx, "uom", v)}
                          disabled={!item.product_id}
                        >
                          <SelectTrigger className="mt-1 h-8"><SelectValue placeholder="Unit" /></SelectTrigger>
                          <SelectContent>
                            {getUomOptions(
                              (pharmaProducts as any[]).find((p: any) => p.id === item.product_id),
                              unitsByProduct[item.product_id],
                            ).map((u) => (
                              <SelectItem key={u.name} value={u.name}>{u.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Qty</Label>
                        <Input type="number" className="mt-1 h-8" placeholder="0" min={1} max={item.inventory_id ? item.available : undefined} value={numVal(item.quantity)} onChange={(e) => updatePharmaItem(idx, "quantity", parseFloat(e.target.value) || 0)} />
                        {item.inventory_id && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{fmtQty(item.available)} {item.uom} available</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">Price / {item.uom || "unit"} (₹)</Label>
                        <Input type="number" className="mt-1 h-8" placeholder="0" value={numVal(item.unit_price)} onChange={(e) => updatePharmaItem(idx, "unit_price", parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="flex items-end justify-end">
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{money(item.quantity * item.unit_price)}</span>
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removePharmaItem(idx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {(() => {
                            const lineTax = getProductLineTax(item.product_id, item.quantity * item.unit_price, item.inventory_id);
                            const hsn = getProductHsn(item.product_id, item.inventory_id);
                            return (
                              <span className="text-xs text-muted-foreground mt-0.5 pr-9">
                                {hsn ? `HSN ${hsn} · ` : ""}
                                {lineTax.rate > 0
                                  ? `Tax (${rateLabel(lineTax.rate)}%): ${money(lineTax.taxAmount)}`
                                  : "No tax"}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {pharmaItems.length > 0 && (
                  <div className="text-right text-sm font-semibold text-foreground">
                    Products subtotal: {money(pharmaSubtotal)}
                  </div>
                )}
              </div>
    </>
  );


  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-subtitle">Manage invoices and payments</p>
        </div>
        <div className="flex gap-2 w-fit flex-wrap">
          {/*
            Every time staff open this dialog themselves, it starts empty.

            The create form's state is shared with Edit Invoice
            (startEditingInvoice seeds the very same serviceInputs/pharmaItems)
            and with the "New Bill" prefill, and nothing used to clear it
            except a successful save. So merely opening an existing invoice to
            edit it, or abandoning a half-made bill, left that invoice's
            service and product lines sitting in state - and the next Create
            Invoice opened already carrying treatments nobody had chosen for
            that patient. That is what was reported as services being added
            automatically "not sure from where it came from", and it is why
            those bills had to be deleted.

            Resetting on open and not on close is deliberate: a programmatic
            setOpen(true) from the two prefill routes does not fire
            onOpenChange, so those still land on a clean form (they call
            resetForm themselves) and then fill it.
          */}
          <Dialog open={open} onOpenChange={(o) => { if (o) resetForm(); setOpen(o); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 w-fit">
                <IndianRupee className="h-4 w-4" />
                Create Invoice
              </Button>
            </DialogTrigger>
          <DialogContent
            className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 overflow-hidden"
            onEscapeKeyDown={(e) => {
              if (!createFormHasContent()) return;
              e.preventDefault();
              toast.info("This invoice is still open", {
                description: "Use the X in the corner to discard it.",
              });
            }}
            onInteractOutside={(e) => {
              if (createFormHasContent()) e.preventDefault();
            }}
          >
            <DialogHeader className="px-6 pt-6 pb-3 border-b">
              <DialogTitle className="font-display">Create Invoice</DialogTitle>
            </DialogHeader>
            <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-0 max-h-[calc(100vh-5rem)] overflow-x-auto">
            <div className="space-y-4 px-6 py-4 overflow-y-auto overflow-x-auto lg:max-h-[calc(100vh-5rem)] min-w-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Invoice #</Label>
                  {/* The number is drawn from the database when the bill is saved,
                      so there is nothing honest to show yet - this box used to
                      display one that was not the number the bill got. */}
                  <Input value="Assigned on save" readOnly className="mt-1.5 bg-muted/50 font-mono text-muted-foreground" />
                </div>
                <div>
                  <Label>Invoice Date</Label>
                  <CalendarPopover
                    selected={invoiceDate}
                    onSelect={(d) => d && setInvoiceDate(d)}
                    trigger={
                      <Button variant="outline" className={cn("mt-1.5 w-full justify-start text-left font-normal", !invoiceDate && "text-muted-foreground")}>
                        <CalendarClock className="mr-2 h-4 w-4" />
                        {invoiceDate ? format(invoiceDate, "dd MMM yyyy") : "Pick a date"}
                      </Button>
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Patient <span className="text-destructive">*</span></Label>
                  <PatientCombobox
                    value={patientId}
                    onValueChange={setPatientId}
                    placeholder="Select patient"
                    className="mt-1.5"
                  />
                </div>
                <div>
                <Label>Doctor</Label>
                <StaffCombobox
                  value={doctorId}
                  onValueChange={handleDoctorChange}
                  allowNone
                  noneLabel="No doctor"
                  placeholder="Select doctor"
                  className="mt-1.5"
                  roleFilter={["Doctor"]}
                />
                {doctorId && (() => {
                  const d: any = (doctorsList as any[]).find((x: any) => x.id === doctorId);
                  const fee = Number(d?.consultation_fee) || 0;
                  return (
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {fee > 0
                        ? `Consultation fee for this doctor is ₹${fee.toLocaleString()} — add it as a service if you are billing it.`
                        : "This doctor has no consultation fee set in Staff Master."}
                    </p>
                  );
                })()}
                </div>
              </div>

              {/* Which visit this bill pays for. Without it the bill saves with
                  appointment_id null and the appointments list - which reads
                  that column alone - shows the visit as unbilled. */}
              {patientId && (
                <div>
                  <Label>Linked Appointment</Label>
                  <Select
                    value={effectiveLinkAppointmentId || "none"}
                    onValueChange={(v) => setLinkAppointmentChoice(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select appointment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked</SelectItem>
                      {(createPatientAppointments as PickerAppointment[]).map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {format(new Date(a.start_time), "dd MMM yyyy, h:mm a")} · {visitLabel(a)}{a.status ? ` · ${a.status}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(() => {
                    // The mistake this is here to catch: Vaishnavi's 5 October
                    // bill went onto her 13 June visit, 114 days away, because
                    // that was the only row in this list that named the
                    // treatment. It warns rather than blocks - billing a visit a
                    // day late is ordinary.
                    const picked = (createPatientAppointments as PickerAppointment[]).find(
                      (a) => a.id === effectiveLinkAppointmentId,
                    );
                    const otherDay =
                      picked?.start_time &&
                      invoiceDate &&
                      !isSameDay(new Date(picked.start_time), invoiceDate);
                    if (otherDay) {
                      return (
                        <p className="text-[11px] text-amber-700 dark:text-amber-500 mt-1">
                          This bill is dated {format(invoiceDate, "dd MMM yyyy")} — the visit you have picked is{" "}
                          {format(new Date(picked!.start_time as string), "dd MMM yyyy")}. Check it is the right one.
                        </p>
                      );
                    }
                    return (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        {effectiveLinkAppointmentId
                          ? "This bill will show against that appointment in the appointments list."
                          : (createPatientAppointments as PickerAppointment[]).length
                            ? "Not linked. Pick the visit this bill is for, so the appointments list shows it against the right one."
                            : "This patient has no appointments to link to."}
                      </p>
                    );
                  })()}
                </div>
              )}

              {serviceAndProductSections}

              {/* Commercial */}
              <div className="rounded-xl border bg-muted/20 p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Commercial</h3>
                  <p className="text-[11px] text-muted-foreground">Payment terms, mode and collection details</p>
                </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payment Type</Label>
                  <Select value={paymentType} onValueChange={setPaymentType}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["One-time", "Recurring"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {renderPaymentMode(paymentMode, setPaymentMode, true)}
                {/* Who raised it - for the clinic, not the patient. Deliberately
                    absent from the invoice, the PDF and the WhatsApp message. */}
                <div>
                  <Label>Billed By <span className="text-destructive">*</span></Label>
                  <Select value={billedBy || undefined} onValueChange={setBilledBy}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Not recorded" /></SelectTrigger>
                    <SelectContent>
                      {BILLED_BY_OPTIONS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tax is auto-applied per item from Tax Master mappings — no manual selector */}
              </div>

              {paymentType === "One-time" && (
                <div className="space-y-3 lg:hidden">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Services Subtotal (₹)</Label>
                      <Input type="number" className="mt-1.5 bg-muted" placeholder="0" value={numVal(Math.round(servicesSubtotal))} readOnly />
                    </div>
                    <div>
                      <Label>Paid Amount (₹)</Label>
                      <Input type="number" className={`mt-1.5 ${splits.length > 0 ? "bg-muted" : ""}`} placeholder="0" value={numVal(paidAmount)} readOnly={splits.length > 0} onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                  {((servicesSubtotal + pharmaSubtotal) > 0) && (() => {
                    const subtotal = servicesSubtotal + pharmaSubtotal;
                    // Sum per-line tax across services and pharma
                    const totalCgst = lineTaxRows.reduce((s, r) => s + r.cgst, 0);
                    const totalSgst = lineTaxRows.reduce((s, r) => s + r.sgst, 0);
                    const totalIgst = lineTaxRows.reduce((s, r) => s + r.igst, 0);
                    const totalTax = totalCgst + totalSgst + totalIgst;
                    return (
                      <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                        {lineTaxRows.length > 0 && (
                          <div className="rounded-md border bg-background/70 overflow-hidden mb-2">
                            {lineTaxRows.map((r) => (
                              <div key={r.key} className="flex justify-between gap-2 px-2 py-1.5 text-[11px] border-b last:border-b-0">
                                <span className="min-w-0 truncate">
                                  {r.name}
                                  <span className="text-muted-foreground"> · {r.rate > 0 ? `GST ${rateLabel(r.rate)}%` : "No tax"}</span>
                                </span>
                                <span className="tabular-nums whitespace-nowrap">{money(r.amount)} + {money(r.tax)} = <strong>{money(r.amount + r.tax)}</strong></span>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="flex justify-between font-semibold text-primary text-base"><span>Grand Total</span><span>{money(subtotal + totalTax)}</span></div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {paymentType === "Staged" && (
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="font-display font-semibold">Payment Stages</Label>
                    <Button type="button" variant="outline" size="sm" className="text-xs" onClick={addStage}>
                      <Plus className="h-3 w-3 mr-1" /> Add Stage
                    </Button>
                  </div>
                  {stages.map((stage, i) => (
                    <div key={i} className="border rounded-lg p-3 bg-muted/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <Input className="h-7 text-xs font-medium w-32 border-0 bg-transparent p-0" value={stage.label} onChange={(e) => updateStage(i, "label", e.target.value)} />
                        {stages.length > 1 && (
                          <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeStage(i)}>Remove</Button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Amount (₹)</Label>
                          <Input type="number" className="mt-1 h-8" placeholder="0" value={numVal(stage.amount)} onChange={(e) => updateStage(i, "amount", parseFloat(e.target.value) || 0)} />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Collected (₹)</Label>
                          <Input type="number" className="mt-1 h-8" placeholder="0" value={numVal(stage.paid)} onChange={(e) => updateStage(i, "paid", parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Total across stages</span><span className="font-semibold">{money(stagedTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Total collected</span><span>{money(stagedPaid)}</span></div>
                    <div className="flex justify-between text-primary font-semibold"><span>Balance</span><span>{money(stagedTotal - stagedPaid)}</span></div>
                    <p className="text-xs text-muted-foreground mt-1">{stages.length} invoice(s) will be created</p>
                  </div>
                </div>
              )}

              {paymentType === "Recurring" && (
                <div className="border-t pt-4 space-y-3">
                  <Label className="font-display font-semibold">Recurring Installments</Label>
                  <div>
                    <Label className="text-xs text-muted-foreground">Total Amount (₹) *</Label>
                    <Input type="number" className="mt-1" placeholder="0" value={numVal(recurringTotalAmount)} onChange={(e) => handleRecurringTotalChange(parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground"># of Installments *</Label>
                      <Input type="number" className="mt-1" placeholder="0" min={0} value={recurringCount === 0 ? "" : recurringCount} onChange={(e) => handleRecurringCountChange(parseInt(e.target.value) || 0)} />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Amount per Installment (₹) *</Label>
                      <Input type="number" className="mt-1" placeholder="0" value={numVal(recurringAmount)} onChange={(e) => setRecurringAmount(parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                  {recurringCount > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      <div className="grid grid-cols-[3rem_1fr_5rem_5rem_5rem] gap-2 text-xs font-medium text-muted-foreground px-2">
                        <span>Inst.</span>
                        <span>Due Date</span>
                        <span className="text-right">Amount</span>
                        <span>Status</span>
                        <span className="text-right">Paid</span>
                      </div>
                      {Array.from({ length: recurringCount }, (_, i) => {
                        const dueDate = recurringDueDates[i] || addMonths(new Date(), i);
                        const instStatus = recurringStatuses[i] || "Pending";
                        const invoiceNow = !!recurringInvoiceNow[i];
                        return (
                          <div key={i} className={cn("grid grid-cols-[3rem_1fr_5rem_5rem_5rem] gap-2 items-center border rounded-lg p-2", invoiceNow ? "border-primary/50 bg-primary/5" : "bg-muted/30")}>
                            <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                            <CalendarPopover
                              selected={dueDate}
                              onSelect={(d) => {
                                if (d) {
                                  const updated = [...recurringDueDates];
                                  updated[i] = d;
                                  setRecurringDueDates(updated);
                                }
                              }}
                              trigger={
                                <Button variant="outline" size="sm" className="h-7 text-xs justify-start font-normal w-full">
                                  {format(dueDate, "dd MMM yyyy")}
                                </Button>
                              }
                            />
                            <span className="text-xs text-right">{money(recurringAmount)}</span>
                            <Select value={instStatus} onValueChange={(v) => {
                              const updated = [...recurringStatuses];
                              updated[i] = v;
                              setRecurringStatuses(updated);
                              const updatedCollected = [...recurringCollected];
                              if (v === "Paid") {
                                updatedCollected[i] = recurringAmount;
                              } else if (instStatus === "Paid") {
                                updatedCollected[i] = 0;
                              }
                              setRecurringCollected(updatedCollected);
                            }}>
                              <SelectTrigger className="h-7 text-xs px-1.5"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {["Pending", "Paid", "Partial", "Overdue"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Input type="number" className="h-7 text-xs" placeholder="0" disabled={instStatus === "Paid"} value={instStatus === "Paid" ? numVal(recurringAmount) : numVal(recurringCollected[i])} onChange={(e) => {
                              const updated = [...recurringCollected];
                              updated[i] = parseFloat(e.target.value) || 0;
                              setRecurringCollected(updated);
                            }} />
                            <label className="col-span-5 flex items-center gap-2 text-[11px] font-medium cursor-pointer">
                              <Checkbox
                                checked={invoiceNow}
                                onCheckedChange={(c) => {
                                  const updated = [...recurringInvoiceNow];
                                  updated[i] = !!c;
                                  setRecurringInvoiceNow(updated);
                                }}
                              />
                              <span className={invoiceNow ? "text-primary" : "text-muted-foreground"}>Invoice now</span>
                            </label>
                            <label className="col-span-5 flex items-center gap-2 text-[11px] font-medium cursor-pointer">
                              <Checkbox
                                checked={!!recurringCreateAppt[i]}
                                onCheckedChange={(c) => {
                                  const updated = [...recurringCreateAppt];
                                  updated[i] = !!c;
                                  setRecurringCreateAppt(updated);
                                }}
                              />
                              <span className={recurringCreateAppt[i] ? "text-primary" : "text-muted-foreground"}>Book a visit for this installment</span>
                            </label>
                            <div className="col-span-5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                              {invoiceNow ? (
                                <>
                                  <span>Tax {money(installmentTax.tax)}</span>
                                  <span className="font-medium text-foreground">Total {money(installmentTotal)}</span>
                                  <span className="text-primary font-medium">Billed now</span>
                                </>
                              ) : (
                                <>
                                  <span>Pay later · tax at collection</span>
                                  <span className="font-medium text-foreground">Scheduled {money(recurringAmount)}</span>
                                </>
                              )}
                              {i === 0 && sourceAppointmentId ? (
                                <span className="flex items-center gap-1">
                                  <CalendarClock className="h-3 w-3" />
                                  Linked to current appointment
                                </span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <CalendarClock className="h-3 w-3" />
                                  Recurring appointment on
                                  <CalendarPopover
                                    selected={recurringApptDates[i] || dueDate}
                                    onSelect={(d) => {
                                      if (!d) return;
                                      const updated = [...recurringApptDates];
                                      updated[i] = d;
                                      setRecurringApptDates(updated);
                                    }}
                                    trigger={
                                      <Button variant="outline" size="sm" className="h-6 px-2 text-[11px] font-medium">
                                        {format(recurringApptDates[i] || dueDate, "dd MMM yyyy")}
                                      </Button>
                                    }
                                  />
                                  {recurringApptDates[i] && (
                                    <button
                                      type="button"
                                      className="underline hover:text-foreground"
                                      onClick={() => {
                                        const updated = [...recurringApptDates];
                                        updated[i] = null;
                                        setRecurringApptDates(updated);
                                      }}
                                    >
                                      reset
                                    </button>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                    <div className="flex justify-between"><span className="text-muted-foreground">Ticked "Invoice now"</span><span className="font-semibold">{dueTodayIndexes.length} of {recurringCount}</span></div>
                    <div className="flex justify-between text-primary font-semibold"><span>Installments billed now (incl. tax)</span><span>{money(dueTodayIndexes.length * installmentTotal)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Pay later ({Math.max(0, recurringCount - dueTodayIndexes.length)} × {money(recurringAmount)})</span><span>{money(recurringAmount * Math.max(0, recurringCount - dueTodayIndexes.length))}</span></div>
                    <p className="text-xs text-muted-foreground mt-1">Tick "Invoice now" on the installments you want billed on this invoice.</p>
                  </div>
                </div>
              )}

              <div>
                <Label>Notes</Label>
                <Textarea className="mt-1.5" placeholder="Optional notes..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>

              {materialSection}
              {/* Mobile-only inline create button (sticky panel handles desktop) */}
              <Button className="w-full lg:hidden" onClick={() => createInvoice.mutate()} disabled={!canCreateInvoice() || createInvoice.isPending}>
                {createInvoice.isPending ? "Creating..." : paymentType === "Staged" ? `Create ${stages.length} Staged Invoice(s)` : paymentType === "Recurring" ? `Create ${recurringCount} Recurring Invoice(s)` : "Create Invoice"}
              </Button>
            </div>

            {/* Right sticky summary panel (desktop) */}
            <aside className="hidden lg:flex flex-col border-l bg-muted/20 max-h-[calc(100vh-5rem)]">
              <div className="px-5 py-4 border-b">
                <h3 className="font-display font-semibold text-sm">Invoice Summary</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Totals update as you edit</p>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm">
                {lineTaxRows.length > 0 && (
                  <div className="rounded-lg border bg-background/70 overflow-hidden mb-3">
                    <div className="grid grid-cols-[1fr_46px_58px_62px] gap-1 px-2 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground bg-muted/60">
                      <span>Line item</span>
                      <span className="text-right">Amt</span>
                      <span className="text-right">Tax</span>
                      <span className="text-right">Total</span>
                    </div>
                    {lineTaxRows.map((r) => (
                      <div key={r.key} className="grid grid-cols-[1fr_46px_58px_62px] gap-1 px-2 py-1.5 text-[11px] border-t items-start">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{r.name}</span>
                          <span className="block text-[10px] text-muted-foreground">
                            {r.kind}{r.qty > 1 ? ` · x${r.qty}` : ""}{r.hsn ? ` · HSN ${r.hsn}` : ""} · {r.rate > 0 ? `GST ${rateLabel(r.rate)}%` : "No tax"}
                          </span>
                        </span>
                        <span className="text-right tabular-nums">{money(r.amount)}</span>
                        <span className="text-right tabular-nums">{money(r.tax)}</span>
                        <span className="text-right tabular-nums font-medium">{money(r.amount + r.tax)}</span>
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_46px_58px_62px] gap-1 px-2 py-1.5 text-[11px] border-t bg-muted/40 font-semibold">
                      <span>Total</span>
                      <span className="text-right tabular-nums">{money(servicesSubtotal + pharmaSubtotal)}</span>
                      <span className="text-right tabular-nums">{money(lineTaxRows.reduce((s, r) => s + r.tax, 0))}</span>
                      <span className="text-right tabular-nums">{money(servicesSubtotal + pharmaSubtotal + lineTaxRows.reduce((s, r) => s + r.tax, 0))}</span>
                    </div>
                  </div>
                )}
                {(() => {
                  if (paymentType === "Staged") {
                    return (
                      <div className="space-y-1">
                        <div className="flex justify-between"><span className="text-muted-foreground">Total across stages</span><span className="font-semibold">{money(stagedTotal)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Total collected</span><span>{money(stagedPaid)}</span></div>
                        <div className="flex justify-between text-primary font-semibold border-t pt-2 mt-2"><span>Balance</span><span>{money(stagedTotal - stagedPaid)}</span></div>
                        <p className="text-xs text-muted-foreground mt-1">{stages.length} invoice(s) will be created</p>
                      </div>
                    );
                  }
                  if (paymentType === "Recurring") {
                    const dueTodayCount = dueTodayIndexes.length;
                    const svcNow = dueTodayCount * recurringAmount;
                    const svcTaxNow = dueTodayCount * installmentTax.tax;
                    const pharmaNow = pharmaSubtotal + pharmaTaxTotals.tax;
                    const payableNow = svcNow + svcTaxNow + pharmaNow;
                    const scheduledLater = recurringAmount * Math.max(0, recurringCount - dueTodayCount);
                    return (
                      <div className="space-y-3">
                        {/* PAY NOW */}
                        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-1">
                          <p className="text-[10px] uppercase tracking-wide font-semibold text-primary">Pay now</p>
                          <div className="flex justify-between"><span className="text-muted-foreground">Installments ticked ({dueTodayCount})</span><span>{money(svcNow + svcTaxNow)}</span></div>
                          {pharmaSubtotal > 0 && (
                            <div className="flex justify-between"><span className="text-muted-foreground">Pharmacy (full, incl. tax)</span><span>{money(pharmaNow)}</span></div>
                          )}
                          <div className="flex justify-between text-primary font-semibold border-t border-primary/20 pt-1.5 mt-1.5 text-base"><span>Total payable now</span><span>{money(payableNow)}</span></div>
                        </div>
                        {/* PAY LATER */}
                        <div className="rounded-lg border border-dashed bg-muted/40 p-3 space-y-1">
                          <p className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">Pay later — subsequent visits</p>
                          <div className="flex justify-between"><span className="text-muted-foreground">{Math.max(0, recurringCount - dueTodayCount)} installment(s) × {money(recurringAmount)}</span><span className="font-semibold">{money(scheduledLater)}</span></div>
                          <p className="text-[11px] text-muted-foreground">Tax is applied at the time of collection.</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground">Installments cover services only ({money(servicesSubtotal)}); pharmacy is billed in full on this invoice.</p>
                      </div>
                    );
                  }
                  // One-time
                  const subtotal = servicesSubtotal + pharmaSubtotal;
                  const totalCgst = lineTaxRows.reduce((s, r) => s + r.cgst, 0);
                  const totalSgst = lineTaxRows.reduce((s, r) => s + r.sgst, 0);
                  const totalIgst = lineTaxRows.reduce((s, r) => s + r.igst, 0);
                  const totalTax = totalCgst + totalSgst + totalIgst;
                  const grand = subtotal + totalTax;
                  const balance = grand - (Number(paidAmount) || 0);
                  return (
                    <div className="space-y-1">
                      <div className="flex justify-between font-semibold text-primary text-base"><span>Grand Total</span><span>{money(grand)}</span></div>
                      <div className="pt-2 mt-2 border-t space-y-2">
                        <div>
                          <Label className="text-xs">Paid Amount (₹)</Label>
                          <Input type="number" className={`mt-1 h-9 ${splits.length > 0 ? "bg-muted" : ""}`} placeholder="0" value={numVal(paidAmount)} readOnly={splits.length > 0} onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)} />
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Balance Due</span>
                          <span className={balance > 0 ? "text-destructive font-medium" : "text-primary font-medium"}>
                            {money(balance)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="border-t px-5 py-4 bg-background/60">
                <Button className="w-full" onClick={() => createInvoice.mutate()} disabled={!canCreateInvoice() || createInvoice.isPending}>
                  {createInvoice.isPending ? "Creating..." : paymentType === "Staged" ? `Create ${stages.length} Staged Invoice(s)` : paymentType === "Recurring" ? `Create ${recurringCount} Recurring Invoice(s)` : "Create Invoice"}
                </Button>
              </div>
            </aside>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Payment Update Dialog */}
      <Dialog open={!!paymentInv} onOpenChange={(o) => { if (!o) setPaymentInv(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Add Payment</DialogTitle>
          </DialogHeader>
          {paymentInv && (
            <div className="space-y-4 pt-2">
              <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-medium">{paymentInv.invoice_number}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Patient</span><span>{getPatientName(paymentInv, patientById) || "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-semibold">₹{Number(paymentInv.total_amount).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Already Paid</span><span>₹{Number(paymentInv.paid_amount).toLocaleString()}</span></div>
                <div className="flex justify-between font-semibold text-primary"><span>Balance Due</span><span>₹{(Number(paymentInv.total_amount) - Number(paymentInv.paid_amount)).toLocaleString()}</span></div>
              </div>
              <div>
                <Label>Payment Amount (₹) *</Label>
                <Input type="number" className="mt-1.5" placeholder={`Max: ₹${(Number(paymentInv.total_amount) - Number(paymentInv.paid_amount)).toLocaleString()}`} value={numVal(addPaymentAmount)} onChange={(e) => setAddPaymentAmount(parseFloat(e.target.value) || 0)} max={Number(paymentInv.total_amount) - Number(paymentInv.paid_amount)} />
              </div>
              <div>
                <Label>Payment Mode</Label>
                <Select value={numVal(addPaymentMode)} onValueChange={setAddPaymentMode}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Cash", "Card", "UPI", "Cheque", "Bank Transfer"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => updatePayment.mutate()} disabled={addPaymentAmount <= 0 || updatePayment.isPending}>
                  {updatePayment.isPending ? "Updating..." : "Add Payment"}
                </Button>
                <Button variant="outline" className="shrink-0" onClick={() => markAsPaid.mutate(paymentInv)} disabled={paymentInv.status === "Paid" || markAsPaid.isPending}>
                  Mark Fully Paid
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="mb-4">
        <ViewBar
          views={allViews}
          activeView={activeView}
          currentUserId={viewsUserId}
          onSelect={selectView}
          onNew={() => { setEditingView(null); setViewEditorOpen(true); }}
          onEdit={(v) => { setEditingView(v); setViewEditorOpen(true); }}
          onDelete={(v) => setDeleteViewTarget(v)}
          onPin={pinDefault}
          onUnpin={unpinDefault}
          onClone={(v) => { setEditingView({ ...v, id: undefined as any, name: `${v.name} (Copy)`, is_default: false }); setViewEditorOpen(true); }}
          onFields={() => setViewFieldsOpen(true)}
          onRefresh={invalidateInvoices}
          display={display}
          onDisplayChange={setDisplay}
          displayModes={["table", "kanban"]}
          onKanbanSettings={() => setKanbanOpen(true)}
          count={total}
          countLoading={invoicesLoading}
          search={search}
          onSearchChange={setSearch}
          itemLabel="Invoices"
          chartsOpen={viewChartsOpen}
          onToggleCharts={() => { setViewChartsOpen((o) => !o); setViewFiltersOpen(false); }}
          filtersOpen={viewFiltersOpen}
          onToggleFilters={() => { setViewFiltersOpen((o) => !o); setViewChartsOpen(false); }}
        />
      </div>

      {(viewFiltersOpen || viewChartsOpen) && (
        <Sheet open onOpenChange={(o) => { if (!o) { setViewFiltersOpen(false); setViewChartsOpen(false); } }}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-md">
            {viewFiltersOpen ? (
              <ViewFiltersPanel
                view={activeView}
                canManage={!!activeView && !activeView.is_standard && activeView.owner_id === viewsUserId}
                fields={BILLING_VIEW_FIELDS}
                optionsFor={viewOptionsFor}
                onSave={(filters) => { if (activeView) saveView({ ...activeView, filters }); }}
                onClose={() => setViewFiltersOpen(false)}
                itemLabel="invoices"
              />
            ) : activeView && !activeView.is_standard ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading charts…</div>}>
                <ViewChartsPanel
                  charts={activeView.charts ?? []}
                  rows={viewFiltered.map(toViewRow)}
                  canManage={activeView.owner_id === viewsUserId}
                  onChange={(charts) => saveCharts(activeView.id, charts)}
                  onClose={() => setViewChartsOpen(false)}
                  fields={BILLING_VIEW_FIELDS}
                  // A chart grouped by a picklist shows the names behind the
                  // ids the column stores - the doctor field holds a staff id.
                  optionsFor={viewOptionsFor}
                  itemLabel="Invoices"
                  defaultGroupField="status"
                />
              </Suspense>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Charts are available on custom list views. Create or select a custom view to add charts.
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}


      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.15 }} className="data-table">
        <div className="p-4 border-b flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search invoices, services, doctor, type..." className="pl-9 bg-muted border-0" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Popover open={showFilters} onOpenChange={setShowFilters}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn("gap-2", hasActiveFilters && "border-primary text-primary")}>
                  <Filter className="h-3.5 w-3.5" />Filter
                  {hasActiveFilters && <span className="h-2 w-2 rounded-full bg-primary" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 space-y-3" align="end">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm">Filters</h4>
                  {hasActiveFilters && <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearFilters}>Clear all</Button>}
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Date From</Label>
                  <CalendarPopover
                    selected={filterDateFrom}
                    onSelect={setFilterDateFrom}
                    trigger={
                      <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                        {filterDateFrom ? format(filterDateFrom, "PPP") : "Any"}
                      </Button>
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Date To</Label>
                  <CalendarPopover
                    selected={filterDateTo}
                    onSelect={setFilterDateTo}
                    trigger={
                      <Button variant="outline" size="sm" className="w-full justify-start text-left font-normal">
                        {filterDateTo ? format(filterDateTo, "PPP") : "Any"}
                      </Button>
                    }
                  />
                </div>
                {!ownScopeOnly && (
                <div className="space-y-2">
                  <Label className="text-xs">Doctor</Label>
                  <Select value={filterDoctor || "all"} onValueChange={(v) => setFilterDoctor(v === "all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Doctors</SelectItem>
                      {uniqueDoctors.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                )}
                <div className="space-y-2">
                  <Label className="text-xs">Service</Label>
                  <Select value={filterService || "all"} onValueChange={(v) => setFilterService(v === "all" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Services</SelectItem>
                      {uniqueServices.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label className="text-xs">Type</Label>
                    <Select value={filterType || "all"} onValueChange={(v) => setFilterType(v === "all" ? "" : v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {["One-time", "Staged", "Recurring"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Status</Label>
                    <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        {["Paid", "Partial", "Pending"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button size="sm" className="w-full" onClick={() => setShowFilters(false)}>Apply</Button>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV}>
              <Download className="h-3.5 w-3.5" />Export
            </Button>
          </div>
        </div>

        {display === "kanban" ? (
          <ListKanban
            rows={pagedInvoices}
            config={kanban}
            options={kanbanOptions}
            columns={displayColumns}
            fields={BILLING_VIEW_FIELDS}
            onOpen={(row) => openViewSheet(row)}
            onMove={moveKanbanCard}
            titleField="patient_name"
          />
        ) : (
        <>
        <div className="overflow-x-auto table-scroll">
          <table ref={invoiceTableRef} className="w-full responsive-table">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left text-xs font-medium text-muted-foreground p-4">Invoice</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-4">Patient</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-4 hidden lg:table-cell">Doctor</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-4 hidden md:table-cell">Services</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-4 hidden sm:table-cell">Type</th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4">Amount</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-4 hidden sm:table-cell">Mode</th>
                <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>
                <th className="text-right text-xs font-medium text-muted-foreground p-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {total === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">
                  {invoicesLoading ? "Loading invoices…" : "No invoices found"}
                </td></tr>
              ) : (
                pagedInvoices.map((inv: any) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openViewSheet(inv)}>
                    <td className="p-4">
                      <p className="font-medium text-sm text-primary hover:underline">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">{displayDate(inv.created_at)}</p>
                    </td>
                    <td className="p-4 text-sm">{getPatientName(inv, patientById) || "—"}</td>
                    <td className="p-4 hidden lg:table-cell">
                      {getDrName(inv, staffById) ? (
                        <span className="text-sm">{getDrName(inv, staffById)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {displayServices(inv).map((s: string, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 hidden sm:table-cell">
                      <Badge variant="outline" className="text-xs">{inv.payment_type}</Badge>
                    </td>
                    <td className="p-4 text-right">
                      <p className="font-semibold text-sm">₹{Number(inv.total_amount).toLocaleString()}</p>
                      {inv.status !== "Pending" && (
                        <p className="text-xs text-muted-foreground">Paid: ₹{Number(inv.paid_amount).toLocaleString()}</p>
                      )}
                    </td>
                    {/* A bill taken across two instruments stores the literal
                        "Split" in payment_mode, so the parts are named here. */}
                    <td className="p-4 hidden sm:table-cell">
                      <span className="text-xs text-muted-foreground">{paymentModeLabel(inv) || "—"}</span>
                    </td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      {inv.status === "Cancelled" ? (
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyles.Cancelled}`}
                          title={inv.cancellation_reason || undefined}
                        >
                          Cancelled
                        </span>
                      ) : (
                        <Select value={inv.status} onValueChange={(v) => updateInvoiceStatus.mutate({ id: inv.id, status: v, prevStatus: inv.status })}>
                          <SelectTrigger className={`h-auto border-0 p-0 shadow-none w-auto gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${statusStyles[inv.status] || ""}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["Pending", "Paid", "Partial", "Overdue"].map(s => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        {inv.status !== "Paid" && inv.status !== "Cancelled" && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Add Payment" onClick={() => { setPaymentInv(inv); setAddPaymentAmount(0); setAddPaymentMode("Cash"); }}>
                            <CreditCard className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Open Invoice PDF" onClick={() => openInvoicePDF(inv)}>
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {total === 0
              ? "Showing 0 invoices"
              : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, total)} of ${total.toLocaleString()}`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="text-xs">Page {currentPage} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </Button>
            </div>
          )}
        </div>
        </>
        )}
      </motion.div>

      {/* Invoice View/Edit — same shell & summary panel as Create Invoice */}
      <Dialog open={!!viewInvoice} onOpenChange={(o) => { if (!o) { setViewInvoice(null); setIsEditing(false); } }}>
        <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-3 border-b">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="font-display">{isEditing ? "Edit Invoice" : "Invoice Details"}</DialogTitle>
                <p className="text-xs text-muted-foreground font-mono">{viewInvoice?.invoice_number}</p>
              </div>
              {viewInvoice?.id && (
                <RecordOwnerField
                  variant="inline"
                  objectType="invoices"
                  objectLabel="Invoice"
                  recordId={viewInvoice.id}
                  recordLabel={viewInvoice.invoice_number || viewInvoice.patient_name || "Invoice"}
                  ownerId={viewInvoice.owner_id}
                  link={`/billing?viewInvoice=${viewInvoice.id}`}
                  onChanged={(ownerId) => setViewInvoice((v: any) => (v ? { ...v, owner_id: ownerId } : v))}
                />
              )}
            </div>
          </DialogHeader>


          <div className="lg:grid lg:grid-cols-[1fr_360px] lg:gap-0 max-h-[calc(100vh-5rem)] overflow-x-auto">
          <div className="space-y-4 px-6 py-4 overflow-y-auto lg:max-h-[calc(100vh-5rem)] min-w-0">

          {viewInvoice && !isEditing && (
            <div className="space-y-4">
              {/* Details */}
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground text-xs block">Patient</span><span className="font-medium">{getPatientName(viewInvoice, patientById) || "Walk-in"}</span></div>
                  <div><span className="text-muted-foreground text-xs block">Date</span><span className="font-medium">{format(new Date(viewInvoice.created_at), "PPP")}</span></div>
                  <div><span className="text-muted-foreground text-xs block">Doctor</span><span className="font-medium">{getDrName(viewInvoice, staffById) || "—"}</span></div>
                  <div>
                    <span className="text-muted-foreground text-xs block">Payment Mode</span>
                    {Array.isArray(viewInvoice.payment_splits) && viewInvoice.payment_splits.length > 1 ? (
                      <span className="font-medium">
                        {viewInvoice.payment_splits.map((p: any) => `${p.mode}: ₹${Number(p.amount).toLocaleString("en-IN")}`).join("  ·  ")}
                      </span>
                    ) : (
                      <span className="font-medium">{viewInvoice.payment_mode || "Cash"}</span>
                    )}
                  </div>
                  {/* The clinic's own record of who raised it. It is not on the
                      invoice the patient receives, nor in its PDF. */}
                  <div><span className="text-muted-foreground text-xs block">Billed By</span><span className="font-medium">{billedByLabel(viewInvoice.billed_by)}</span></div>
                  <div><span className="text-muted-foreground text-xs block">Type</span><Badge variant="outline" className="text-xs mt-0.5">{viewInvoice.payment_type}</Badge></div>
                  <div><span className="text-muted-foreground text-xs block">Status</span><span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusStyles[viewInvoice.status] || ""}`}>{viewInvoice.status}</span></div>
                </div>
                {viewInvoice.status === "Cancelled" && (
                  <div className="rounded-md border border-muted-foreground/20 bg-background p-3 text-sm space-y-1">
                    <p className="text-xs text-muted-foreground">Cancellation reason</p>
                    <p className="font-medium">{viewInvoice.cancellation_reason || "—"}</p>
                    {viewInvoice.cancelled_at && (
                      <p className="text-xs text-muted-foreground">
                        Cancelled {format(new Date(viewInvoice.cancelled_at), "PPP p")}
                        {viewInvoice.cancelled_by_name ? ` by ${viewInvoice.cancelled_by_name}` : ""}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Line items with rate, tax and total */}
              {(() => {
                const rows = invoiceLineRows(viewInvoice);
                if (rows.length === 0) return null;
                const t = rows.reduce(
                  (a, r) => ({ amount: a.amount + r.amount, tax: a.tax + r.tax, total: a.total + r.total }),
                  { amount: 0, tax: 0, total: 0 },
                );
                return (
                  <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 text-xs text-muted-foreground">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Item</th>
                          <th className="text-left px-3 py-2 font-medium">HSN</th>
                          <th className="text-right px-3 py-2 font-medium">Qty</th>
                          <th className="text-right px-3 py-2 font-medium">Rate</th>
                          <th className="text-right px-3 py-2 font-medium">Amount</th>
                          <th className="text-right px-3 py-2 font-medium">GST %</th>
                          <th className="text-right px-3 py-2 font-medium">Tax</th>
                          <th className="text-right px-3 py-2 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2 text-muted-foreground text-xs">{r.hsn || "—"}</td>
                            <td className="px-3 py-2 text-right">{r.qty}</td>
                            <td className="px-3 py-2 text-right">{formatMoneyPrecise(r.price)}</td>
                            <td className="px-3 py-2 text-right">{formatMoneyPrecise(r.amount)}</td>
                            <td className="px-3 py-2 text-right">{r.gst ? `${r.gst}%` : "—"}</td>
                            <td className="px-3 py-2 text-right">{formatMoneyPrecise(r.tax)}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatMoneyPrecise(r.total)}</td>
                          </tr>
                        ))}
                        {/* Tax breakdown - shown as its own row(s) right above Total,
                            not a separate box further down the page. */}
                        {Number(viewInvoice.cgst_amount) > 0 && (
                          <tr className="border-t text-muted-foreground">
                            <td className="px-3 py-1.5" colSpan={6}>CGST</td>
                            <td className="px-3 py-1.5 text-right">{formatMoneyPrecise(Number(viewInvoice.cgst_amount))}</td>
                            <td className="px-3 py-1.5" />
                          </tr>
                        )}
                        {Number(viewInvoice.sgst_amount) > 0 && (
                          <tr className="border-t text-muted-foreground">
                            <td className="px-3 py-1.5" colSpan={6}>SGST</td>
                            <td className="px-3 py-1.5 text-right">{formatMoneyPrecise(Number(viewInvoice.sgst_amount))}</td>
                            <td className="px-3 py-1.5" />
                          </tr>
                        )}
                        {Number(viewInvoice.igst_amount) > 0 && (
                          <tr className="border-t text-muted-foreground">
                            <td className="px-3 py-1.5" colSpan={6}>IGST</td>
                            <td className="px-3 py-1.5 text-right">{formatMoneyPrecise(Number(viewInvoice.igst_amount))}</td>
                            <td className="px-3 py-1.5" />
                          </tr>
                        )}
                        {!Number(viewInvoice.cgst_amount) && !Number(viewInvoice.sgst_amount) && !Number(viewInvoice.igst_amount) && viewInvoice.tax_rate > 0 && (
                          <>
                            {/* No stored cgst/sgst/igst split on this invoice - default to
                                the same unconditional 50/50 CGST+SGST assumption used
                                everywhere else in this app (e.g. sf-import-clinical),
                                rather than a flat, unlabeled "Tax" line. */}
                            <tr className="border-t text-muted-foreground">
                              <td className="px-3 py-1.5" colSpan={6}>CGST</td>
                              <td className="px-3 py-1.5 text-right">{formatMoneyPrecise(t.tax / 2)}</td>
                              <td className="px-3 py-1.5" />
                            </tr>
                            <tr className="border-t text-muted-foreground">
                              <td className="px-3 py-1.5" colSpan={6}>SGST</td>
                              <td className="px-3 py-1.5 text-right">{formatMoneyPrecise(t.tax / 2)}</td>
                              <td className="px-3 py-1.5" />
                            </tr>
                          </>
                        )}
                        <tr className="border-t bg-muted/40 font-semibold">
                          <td className="px-3 py-2" colSpan={4}>Total</td>
                          <td className="px-3 py-2 text-right">{formatMoney(t.amount)}</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right">{formatMoney(t.tax)}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(t.total)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {viewInvoice.notes && (
                <div className="bg-muted/30 rounded-lg p-3 text-sm">
                  <span className="text-muted-foreground text-xs block mb-1">Notes</span>
                  {viewInvoice.notes}
                </div>
              )}

              {/* Linked appointment */}
              {viewInvoice.appointments && (
                <button
                  onClick={() => { setViewInvoice(null); openAppointment(viewInvoice.appointments.id); }}
                  className="w-full flex items-center gap-2 text-sm text-primary bg-primary/5 hover:bg-primary/10 rounded-lg px-3 py-2 transition-colors"
                >
                  <CalendarClock className="h-4 w-4" />
                  <span>{viewInvoice.appointments.service} · {format(new Date(viewInvoice.appointments.start_time), "MMM d, h:mm a")}</span>
                </button>
              )}

              <SystemRecordSection
                record={viewInvoice}
                owner={{
                  objectType: "invoices",
                  objectLabel: "Invoice",
                  recordLabel: viewInvoice.invoice_number || viewInvoice.patient_name || "Invoice",
                  link: `/billing?viewInvoice=${viewInvoice.id}`,
                  onChanged: (ownerId) => setViewInvoice((v: any) => (v ? { ...v, owner_id: ownerId } : v)),
                }}
              />
              <FieldHistorySection objectType="invoices" recordId={viewInvoice.id} />
            </div>
          )}

          {/* Edit Mode */}
          {viewInvoice && isEditing && (
            <div className="space-y-4">
              {/* Both were unreachable from here: the patient was a disabled box -
                  blank whenever the bill had no patient, which is precisely when
                  it needs correcting - and the doctor was not on the form at all. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Patient <span className="text-destructive">*</span></Label>
                  <PatientCombobox
                    value={editData.patient_id || ""}
                    onValueChange={(v) => {
                      const p = patientById.get(v) as { first_name?: string; last_name?: string } | undefined;
                      setEditData({
                        ...editData,
                        patient_id: v,
                        // The bill keeps its own copy of the name; move it with
                        // the link or the two disagree.
                        patient_name: p ? `${p.first_name} ${p.last_name || ""}`.trim() : editData.patient_name,
                      });
                    }}
                    placeholder="Select patient"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>Doctor</Label>
                  <StaffCombobox
                    value={editData.doctor_id || ""}
                    onValueChange={(v) => setEditData({ ...editData, doctor_id: v })}
                    allowNone
                    noneLabel="No doctor"
                    placeholder="Select doctor"
                    className="mt-1.5"
                    roleFilter={["Doctor"]}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Total Amount (₹)</Label>
                  {/* Read-only now that the lines below are editable. It used
                      to be free text while the lines were not, so an invoice
                      could be edited to 600 while its lines still said 800 -
                      and the printed copy is built from the lines. */}
                  <Input type="number" className="mt-1.5" value={numVal(linesGrandTotal)} disabled />
                  <p className="text-[11px] text-muted-foreground mt-1">Adds up from the services and products below.</p>
                </div>
                <div>
                  <Label>Paid Amount (₹)</Label>
                  <Input
                    type="number"
                    className={`mt-1.5 ${splits.length > 0 ? "bg-muted" : ""}`}
                    value={splits.length > 0 ? numVal(splitTotalAmount) : numVal(editData.paid_amount)}
                    readOnly={splits.length > 0}
                    onChange={(e) => setEditData({ ...editData, paid_amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Payment Type</Label>
                  <Select value={editData.payment_type} onValueChange={(v) => setEditData({ ...editData, payment_type: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["One-time", "Staged", "Recurring"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {renderPaymentMode(
                  editData.payment_mode,
                  (v) => setEditData({ ...editData, payment_mode: v }),
                  editData.payment_type === "One-time",
                )}
                <div>
                  <Label>Billed By</Label>
                  <Select
                    value={editData.billed_by || undefined}
                    onValueChange={(v) => setEditData({ ...editData, billed_by: v })}
                  >
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Not recorded" /></SelectTrigger>
                    <SelectContent>
                      {BILLED_BY_OPTIONS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea className="mt-1.5" value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })} rows={2} />
              </div>

              {/* The same blocks the create form uses, so what was billed can
                  actually be changed here - and so the two forms cannot drift. */}
              <div className="space-y-4">
                {serviceAndProductSections}
              </div>
              <div>
                <Label>Linked Appointment</Label>
                {linkPatientId ? (
                  <>
                    <Select
                      value={editData.appointment_id || "none"}
                      onValueChange={(v) => setEditData({ ...editData, appointment_id: v === "none" ? "" : v })}
                    >
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select appointment" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not linked</SelectItem>
                        {(patientAppointments as any[]).map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>
                            {format(new Date(a.start_time), "dd MMM yyyy, h:mm a")} · {visitLabel(a)}{a.status ? ` · ${a.status}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground mt-1">Only appointments of {viewInvoice.patient_name || "this patient"} are listed.</p>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground mt-1.5">This invoice has no patient record linked, so appointments cannot be listed.</p>
                )}
              </div>
            </div>
          )}
          </div>

          {/* Right sticky summary panel — mirrors the Create Invoice layout */}
          {viewInvoice && (
            <aside className="flex flex-col border-t lg:border-t-0 lg:border-l bg-muted/20 lg:max-h-[calc(100vh-5rem)]">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm">
                <div className="flex justify-between font-semibold text-primary text-base">
                  <span>Grand Total</span>
                  <span>{formatMoney(Number(isEditing ? editData.total_amount : viewInvoice.total_amount))}</span>
                </div>
                <div className="pt-2 mt-2 border-t space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Paid</span>
                    <span>{formatMoney(Number(isEditing ? editData.paid_amount : viewInvoice.paid_amount))}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Payment Mode</span>
                    <span>
                      {Array.isArray(viewInvoice.payment_splits) && viewInvoice.payment_splits.length > 0
                        ? "Split"
                        : (viewInvoice.payment_mode || "Cash")}
                    </span>
                  </div>
                  {Array.isArray(viewInvoice.payment_splits) && viewInvoice.payment_splits.map((p: any, i: number) => (
                    <div key={i} className="flex justify-between text-xs text-muted-foreground pl-3">
                      <span>{p.mode}</span>
                      <span>{formatMoney(Number(p.amount || 0))}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Balance Due</span>
                    {(() => {
                      const bal = Number(isEditing ? editData.total_amount : viewInvoice.total_amount) - Number(isEditing ? editData.paid_amount : viewInvoice.paid_amount);
                      return <span className={bal > 0 ? "text-destructive font-medium" : "text-primary font-medium"}>{formatMoney(bal)}</span>;
                    })()}
                  </div>
                </div>
              </div>
              <div className="border-t px-5 py-4 bg-background/60 space-y-2">
                {isEditing ? (
                  <>
                    <Button className="w-full" onClick={() => updateInvoice.mutate()} disabled={updateInvoice.isPending}>
                      {updateInvoice.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                    <Button variant="outline" className="w-full" onClick={() => setIsEditing(false)}>Cancel</Button>
                  </>
                ) : viewInvoice.status === "Cancelled" ? (
                  <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => openInvoicePDF(viewInvoice)}>
                    <FileText className="h-3.5 w-3.5" /> PDF
                  </Button>
                ) : (
                  <>
                    <Button className="w-full gap-1.5" onClick={() => startEditingInvoice(viewInvoice)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit Invoice
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-1.5"
                      disabled={sendingWhatsApp}
                      onClick={() => sendInvoiceWhatsApp(viewInvoice)}
                    >
                      <MessageCircle className="h-3.5 w-3.5" /> {sendingWhatsApp ? "Sending…" : "Send via WhatsApp"}
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openInvoicePDF(viewInvoice)}>
                        <FileText className="h-3.5 w-3.5" /> PDF
                      </Button>
                      <Button variant="destructive" size="sm" className="flex-1 gap-1.5" onClick={() => { setCancelReason(""); setCancelDialogOpen(true); }}>
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </aside>
          )}
          </div>
        </DialogContent>
      </Dialog>

      <AppointmentDetailSheet
        appointmentId={selectedAppointmentId}
        onClose={closeAppointment}
      />

      <KanbanSettingsDialog
        open={kanbanOpen}
        onOpenChange={setKanbanOpen}
        config={kanban}
        groupFields={kanbanGroupFields}
        summaryFields={kanbanSummaryFields}
        defaultGroupField="status"
        onSave={(cfg) => {
          setKanban(cfg);
          setKanbanConfig("billing", activeView?.id ?? ALL_VIEW_ID, cfg);
          setDisplay("kanban");
        }}
      />

      <ViewEditorDialog
        open={viewEditorOpen}
        onOpenChange={setViewEditorOpen}
        view={editingView}
        onSave={saveView}
        fields={BILLING_VIEW_FIELDS}
        defaultColumns={DEFAULT_BILLING_VIEW_COLUMNS}
        optionsFor={viewOptionsFor}
        people={staffList
          .filter((s: any) => s.auth_user_id)
          .map((s: any) => ({ value: s.auth_user_id, label: `${s.first_name || ""} ${s.last_name || ""}`.trim() }))}
        itemLabel="invoices"
      />

      <FieldsDisplayDialog
        open={viewFieldsOpen}
        onOpenChange={setViewFieldsOpen}
        viewName={activeView?.name ?? "All Invoices"}
        columns={displayColumns}
        onSave={(cols) => {
          if (!activeView) return;
          if (activeView.is_standard) updateStandardColumns(activeView.id, cols);
          else saveView({ ...activeView, columns: cols });
        }}
        fields={BILLING_VIEW_FIELDS}
        defaultColumns={DEFAULT_BILLING_VIEW_COLUMNS}
      />

      <AlertDialog open={cancelDialogOpen} onOpenChange={(o) => { if (!cancelInvoice.isPending) { setCancelDialogOpen(o); if (!o) setCancelReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invoice {viewInvoice?.invoice_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              The invoice stays on record with its number intact and shows as Cancelled - it isn't deleted, so
              nothing disappears from Reports or breaks the invoice number sequence. A reason is required.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            autoFocus
            placeholder="Reason for cancelling this invoice..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelInvoice.isPending}>Back</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelInvoice.isPending || !cancelReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!viewInvoice || !cancelReason.trim()) return;
                await cancelInvoice.mutateAsync({ id: viewInvoice.id, reason: cancelReason.trim() });
                setCancelDialogOpen(false);
                setCancelReason("");
              }}
            >
              {cancelInvoice.isPending ? "Cancelling..." : "Cancel Invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <PdfPreviewDialog
        open={pdfOpen}
        onClose={() => { setPdfOpen(false); setPdfUrl(null); setPdfHtml(null); setPdfError(null); setPdfNotice(null); }}
        title={pdfInvoice?.invoice_number ? `Invoice ${pdfInvoice.invoice_number}` : "Invoice"}
        preparing="Preparing the invoice…"
        pages={pdfPages}
        url={pdfUrl}
        html={pdfHtml}
        error={pdfError}
        notice={pdfNotice}
        onDownload={downloadInvoicePDF}
        downloading={pdfDownloading}
        onRetry={() => pdfInvoice && openInvoicePDF(pdfInvoice)}
      />
    </div>
  );
};

export default Billing;
