import { describe, it, expect } from "vitest";
import { primaryVendorContact } from "./vendorContacts";

/**
 * The reported fault: contacts entered in Vendor Master, and the Assets tab
 * showing "—" for Contact and Phone on nearly every vendor. Live data at the
 * time: 15 contacts across 11 of 12 vendors in vendor_contacts, and the flat
 * phone column populated on zero vendors.
 */

const BTL = { id: "btl", contact_person: null, phone: null, email: null };
const G3 = { id: "g3", contact_person: "Mariappa", phone: null, email: null };

const CONTACTS = [
  { vendor_id: "btl", contact_name: "Rakesh", phone: "9876500001", email: "r@btl.in" },
  { vendor_id: "btl", contact_name: "Sunita", phone: "9876500002", email: null },
  { vendor_id: "g3", contact_name: "Mariappa G3", phone: "9876500003", email: null },
];

describe("primaryVendorContact", () => {
  it("shows the contact the clinic entered in Vendor Master", () => {
    // This is what the Assets tab was failing to show at all.
    expect(primaryVendorContact(BTL, CONTACTS)).toEqual({
      name: "Rakesh",
      phone: "9876500001",
      email: "r@btl.in",
    });
  });

  it("prefers the child contact over the old flat field", () => {
    // G3 has both. Vendor Master writes the child row, so it is the current one.
    expect(primaryVendorContact(G3, CONTACTS).name).toBe("Mariappa G3");
  });

  it("still shows the flat fields for a vendor that only has those", () => {
    // Two vendors relied on these; dropping them would blank their rows.
    const onlyFlat = { id: "old", contact_person: "Kailash", phone: "9000000000", email: null };
    expect(primaryVendorContact(onlyFlat, CONTACTS)).toEqual({
      name: "Kailash",
      phone: "9000000000",
      email: "",
    });
  });

  it("takes the first contact when a vendor has several", () => {
    expect(primaryVendorContact(BTL, CONTACTS).name).toBe("Rakesh");
  });

  it("ignores a blank line left in the contacts form", () => {
    const withBlank = [{ vendor_id: "old", contact_name: "  ", phone: "123" }];
    const onlyFlat = { id: "old", contact_person: "Kailash", phone: "9000000000" };
    // An empty row must not hide the real details behind nothing.
    expect(primaryVendorContact(onlyFlat, withBlank).name).toBe("Kailash");
  });

  it("falls back per field, not all or nothing", () => {
    // A named contact with no number still shows the vendor's own number.
    const vendor = { id: "x", contact_person: "Old Name", phone: "9111111111" };
    const contacts = [{ vendor_id: "x", contact_name: "New Person", phone: null }];
    expect(primaryVendorContact(vendor, contacts)).toEqual({
      name: "New Person",
      phone: "9111111111",
      email: "",
    });
  });

  it("does not borrow another vendor's contact", () => {
    const stranger = { id: "nobody", contact_person: null, phone: null };
    expect(primaryVendorContact(stranger, CONTACTS)).toEqual({ name: "", phone: "", email: "" });
  });

  it("copes with a vendor or a list that is not there", () => {
    expect(primaryVendorContact(null, CONTACTS)).toEqual({ name: "", phone: "", email: "" });
    expect(primaryVendorContact(BTL, null)).toEqual({ name: "", phone: "", email: "" });
    expect(primaryVendorContact(BTL, [])).toEqual({ name: "", phone: "", email: "" });
  });
});
