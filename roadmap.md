# Appointment loading
- [x] Correct ambiguous assigned-staff lookups across appointment lists, details, patient history and portal reads; deployed affected functions, five regression tests passed, and signed-in appointment details/list readback returned successful responses with real records.

# Knowledge management
- [x] Move appointment knowledge into prescriptions, order new-prescription tabs with Procedure default, and show matching articles as cards; verified a real matching article opens in the appointment's new prescription and phone layout fits; 15 existing rule tests passed.
- [x] Store service-linked articles with demographics, categories and clinical content.
- [x] Enforce clinician review and publication; preserve published content while AI suggestions await review.
- [x] Add article management and Service Master entry points.
- [x] Add AI drafting/enrichment with manual comparison and acceptance; live proposal verified and discarded.
- [x] Match published guidelines to appointment services, age and gender; copy care into prescription notes.
- [x] Verify saved drafts, clinician review history, anonymous read exclusion and appointment readback; 42 matching/prescription tests pass.

# Knowledge enhancements
- [x] Add private attachments, documents, image and video/reference links.
- [x] Add grounded AI references, related service articles and educational pictures with clinician review; live proposals generated and discarded.
- [x] Add prominent demographic/category labels, editable automatic titles, clone/cancel and Trash deletion.
- [x] Add detailed named revision history with field changes.
- [x] Add shared doctor votes/comments and open counts in master and matched appointment articles.
- [x] Verify saved attachment/link, vote/comment readback, before/after history, inactive clone, Trash deletion and phone layout; nine rule tests passed. Real appointment checked excludes unrelated service articles; no existing appointment matches the currently published article for a positive appointment-feedback check.