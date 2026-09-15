# Invoice PDF to match Salesforce format + fix WhatsApp delivery

## Verified current state

- The current invoice PDF (INV-898115) already uses the Salesforce layout: header pairs (Patient Name/ID, Age/Sex, Billing ID, Mobile, Dr/Ref.By, Date, GST No), a bordered line-item table, Total Billed / Total Paid, Amount in words, Mode of payment, Authorized Signatory and a centered footer.
- Remaining differences from the uploaded Salesforce sample:
  - Doctor prints as "Dr. Dr Vindhya Pai Dermatology" (double "Dr" and specialization instead of qualification "M.B.B.S. MD"). Need only single "Dr"
  - Footer prints "The Skin Clinic, The Skin Clinic, Vyas Rao Road, Kadri Kambla, Mangalore, Mangalore, 575001" (clinic name and city duplicated) and "Website: [www.gmail.com](http://www.gmail.com)" (derived from the Gmail address instead of theskinclinic.org.in).
  - Long particulars are truncated with an ellipsis instead of wrapping.
  - No tax-summary row; the sample shows a full tax breakup line.
- GST columns show 0.00 because the saved `line_items` carry `gst: 0` even where the HSN has a rate (invoice INV-898115 has HSN `999722`, which is 5% in `hsn_tax_master`). One product line carries `AMG001`, which is a product code, not an HSN.
- Clinic settings already hold GST No `29AGRPP7457M1Z7`, so the GST number is available and does print.
- WhatsApp: the last invoice message was accepted by Twilio (SID `MM8714d5fd19ec0a288fe4111c2815d35f`, to `whatsapp:+919148181465`) — the function ran and returned success, so the failure is in delivery, not in sending.

## Implementation

### 1. GST from the Tax Master (HSN)

- In the invoice PDF builder, when a line's GST rate is missing or zero, look up the rate from `hsn_tax_master` by HSN code and use it.
- Split as SGST/CGST when clinic and patient state match, IGST otherwise, and compute the tax amount per line from the resolved rate.
- Show the same resolved rates in the Billing screen's line-item table so the on-screen invoice and the PDF always agree.
- Where a line's HSN is not a valid HSN (e.g. a product code), fall back to the product's own GST rate and leave the HSN cell showing the stored value.

### 2. Match the Salesforce template exactly

- Doctor line: print "Dr. &nbsp; &nbsp;" with no duplicate "Dr" prefix, using qualification when present and specialization only as a fallback.
- Footer: clinic address line without repeating the clinic name or city; website taken from the clinic's website field (theskinclinic.org.in) rather than derived from the email domain; keep the contact-numbers line and the separator.
- Replace the Salesforce system line with a neutral "System generated invoice" line.
- Wrap long particulars onto a second line instead of truncating; grow the row height as needed.
- Add a tax-summary row above Total Billed showing taxable value and total SGST/CGST (or IGST), then Total Billed, Total Paid and Balance.
- Keep Amount in words, Mode of payment (with the split break-up already shown) and Authorized Signatory as they are today.

### 3. WhatsApp invoice delivery

- Read back Twilio's delivery status for the message after sending and log it, and record any Twilio error code so failures are visible instead of silently "sent".
- Show an accurate toast: "queued/sent" only when Twilio accepts, and surface the Twilio error code and message when it fails.
- Attach the invoice PDF to the message instead of relying on a template-built link, and make the send wait for the PDF to exist so the patient always receives a working document.
- Diagnose the current non-delivery by querying Twilio for that message SID and reporting the exact status/error (common causes: template not approved for the sender, the sender not being a production WhatsApp number, or the recipient not opted in) — then fix what the status shows.

## Verification

- Regenerate a PDF for an existing invoice with a taxable HSN, render every page to an image and compare against the uploaded Salesforce sample for header fields, tax split, totals, payment mode and footer.
- Re-send one invoice over WhatsApp and confirm the delivered status from Twilio, not just acceptance.