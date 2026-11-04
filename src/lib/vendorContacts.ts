/**
 * A vendor's contact, from whichever of the two places it was stored in.
 *
 * The clinic entered contacts in Vendor Master and the Assets tab showed
 * nothing but dashes. Both screens read the same twelve vendors; they read
 * different columns.
 *
 *   vendors.contact_person / phone / email   flat, on the vendor row
 *   vendor_contacts                          a child table, one row per person
 *
 * Vendor Master writes only the child table - it deletes and re-inserts those
 * rows on every save and never touches the flat columns. The Assets tab
 * rendered only the flat columns. Measured on the live data: 15 contacts
 * across 11 of 12 vendors in the child table, and the flat phone column
 * populated on exactly ZERO vendors. So the Assets tab could not have shown a
 * phone number for anyone, whatever the clinic typed.
 *
 * Nothing on screen should have to know which of the two a contact sits in.
 * The child table wins where it has anything, because that is what Vendor
 * Master writes; the flat columns remain as a fallback for the two older
 * vendors that only ever had those.
 */

export interface VendorContactRow {
  vendor_id?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface VendorFlatFields {
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface VendorContact {
  name: string;
  phone: string;
  email: string;
}

const clean = (value: string | null | undefined) => String(value ?? "").trim();

/**
 * The one contact worth showing in a list, for this vendor.
 *
 * `contacts` may be every row in the table - it is filtered by vendor here so
 * the caller can fetch once for the whole page rather than once per row.
 */
export function primaryVendorContact(
  vendor: ({ id?: string | null } & VendorFlatFields) | null | undefined,
  contacts: VendorContactRow[] | null | undefined,
): VendorContact {
  const flat: VendorContact = {
    name: clean(vendor?.contact_person),
    phone: clean(vendor?.phone),
    email: clean(vendor?.email),
  };
  if (!vendor?.id) return flat;

  // A row with no name is a blank line somebody left in the form; it is not a
  // contact and must not hide the flat fields behind an empty one.
  const own = (contacts ?? []).find(
    (c) => c?.vendor_id === vendor.id && clean(c.contact_name) !== "",
  );
  if (!own) return flat;

  return {
    name: clean(own.contact_name),
    // Fall back per field: a child contact with a name but no number should
    // still show the vendor's own number rather than nothing.
    phone: clean(own.phone) || flat.phone,
    email: clean(own.email) || flat.email,
  };
}
