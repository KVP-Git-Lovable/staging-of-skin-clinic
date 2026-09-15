# Update and deploy the prescription PDF

## Verified current state

- Commit `09983f9` is present locally and changes `generate-prescription-pdf` from a two-column clinical body to sequential full-width sections.
- The Lovable-generated PDF uploaded at 09:27 UTC still shows the earlier two-column body, so the running function is not serving the checked-in commit.
- The uploaded reference uses a mint clinic header, white document body, full clinic address/contact details, doctor and prescription metadata, a structured medicine table, section dividers, and a centered contact footer.
- The current source instead paints the entire body mint and renders medicines as paragraph text, so deploying commit `09983f9` alone would fix the stale columns but would not fully match the requested reference formatting.

## Implementation

1. **Align the PDF template with the reference**
   - Keep the latest sequential full-width clinical sections from commit `09983f9`.
   - Use the reference’s mint header and white body, clinic logo, clinic name, address/contact block, doctor details, prescription number/date, patient details, separators, and footer treatment.
   - Render prescribed medicines in a bordered table with serial number, product, and complete instruction/dosage text.
   - Keep Review removed, consistent with the procedure form requirements.

2. **Make the renderer resilient**
   - Wrap long clinic, patient, clinical, and medicine text without clipping.
   - Add page-break handling so long prescriptions continue cleanly and retain usable margins/footer space.
   - Use stored clinic settings where available and retain safe clinic defaults for missing values.

3. **Deploy the actual function revision**
   - Deploy `generate-prescription-pdf` directly to Lovable Cloud so it no longer depends on GitHub code sync to update the running backend function.
   - Confirm the deployment serves the revised source rather than the older two-column revision.

4. **Verify with a real prescription**
   - Generate a fresh PDF through the same procedure action used by the app.
   - Visually inspect every rendered page against the uploaded reference for colors, logo/address details, full-width sections, medicine table, wrapping, spacing, and footer placement.
   - Re-test upload/WhatsApp mode because it calls the same PDF function.

## Expected result

Newly generated prescriptions use the reference’s clinic branding and document formatting, retain the requested full-width clinical layout, include a complete medicine table, and are produced by the newly deployed function in both download and WhatsApp flows.
