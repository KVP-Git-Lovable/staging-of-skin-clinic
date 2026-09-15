# Import the full Salesforce product master

## Goal
Make **Sync from Salesforce** import the 296 Salesforce records classified as **Product master**, preserve their available product details, and prevent the 51 **Procedure master** records from entering Pharmacy.

## Confirmed current state
- The Pharmacy button invokes `sync-salesforce-products` and refreshes the product list after success.
- The function currently queries the standard Salesforce `Product2` object, which has only **37** records in this org and is not the 360-record master shown in the reference.
- The actual Salesforce object is `Product__c` (“Product and Procedure master”): **296 Product master**, **51 Procedure master**, and **13 unclassified** records.
- The clinic database currently has **24** pharmacy products; the recent incorrect sync added procedure/service-like records.
- The live `pharma_products` table does not yet have `salesforce_id`, although an unapplied repository migration already defines Salesforce tracking and medicine-detail fields.

## Implementation
1. **Prepare reliable Salesforce tracking**
   - Apply the existing pharmacy Salesforce-fields migration exactly as stored in the repository.
   - Use `salesforce_id` as the stable unique key so repeat syncs update records instead of duplicating them.

2. **Correct the Salesforce source and filtering**
   - Change `sync-salesforce-products` from `Product2` to `Product__c`.
   - Query only records whose Salesforce record type is **Product master**; exclude Procedure master and unclassified records.
   - Follow Salesforce pagination (`nextRecordsUrl`) so the implementation remains complete if the catalog later exceeds one response page.

3. **Map all available product details**
   - Product name → name.
   - Product/Machine category → category.
   - Selling UOM → product unit fields.
   - Product code → HSN/product-code field currently used by Pharmacy.
   - Minimum order quantity → reorder level.
   - Product/Prescription details and Standard instruction from Dr → Pharmacy instruction/detail fields without truncating long text.
   - Salesforce quantity available will be handled through the existing inventory model rather than overwriting unrelated product fields.
   - Extract Default Duration only from clear phrases in the Salesforce text (for example, “for 2 months”); leave it blank when no reliable duration is present.

4. **Remove the prior wrong imports safely**
   - Identify records created by the prior `Product2` sync that correspond to procedures/services rather than Product master records.
   - Remove only confirmed erroneous sync records, preserving manually created products and any valid products that share a name with Salesforce.
   - Respect linked billing, prescription, cart, and inventory records; do not delete a record if doing so would damage clinical or financial history.

5. **Improve sync feedback and error handling**
   - Return accurate totals for imported, updated, skipped, and failed records.
   - Show provider/function error details in the Pharmacy UI instead of a generic invocation error.
   - Keep CORS and connector-gateway authentication unchanged except where required for the corrected query.

6. **Deploy, run, and verify**
   - Deploy `sync-salesforce-products`.
   - Run the live sync and confirm **296 Salesforce Product master records** are processed, with zero Procedure master records imported.
   - Verify representative products include category, UOM, instructions/details, reorder quantity, product code, and extracted duration where present.
   - Run the sync a second time to confirm idempotency (updates, no duplicates), then check the preview build and Pharmacy list.

## Technical notes
- The linked `skin_clinic` Salesforce connector is accessible and working; no new credentials or connector setup is needed.
- The Salesforce master has no dedicated duration field, so duration extraction will be conservative and deterministic rather than AI-generated.
- Existing product rows will be reconciled by Salesforce ID first and normalized exact name only for the first migration pass.
