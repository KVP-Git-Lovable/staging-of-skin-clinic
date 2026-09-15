// Sentinel value used by Service/Medicine pickers that offer an "Others"
// choice for typing a name that isn't in the master list. When selected,
// the real service_id/product_id is left null/empty and the typed text is
// saved directly into the service_name/medicine_name/product_name column -
// PDFs and invoices already read those text columns directly, so a custom
// entry needs no other wiring.
export const OTHERS_VALUE = "__others__";
