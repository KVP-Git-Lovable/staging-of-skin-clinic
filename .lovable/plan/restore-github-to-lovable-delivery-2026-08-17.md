# Restore GitHub-to-Lovable delivery

## Verified current state

- Commits `570df9c` and `47c61d8` are present on the current Lovable `main` history, followed by `7316f21` (`Trigger Lovable sync`). The staff validation is present in `ProcedureFormDialog.tsx`, so GitHub-to-Lovable **code sync has completed**.
- The live database has no `assisted_by` foreign-key constraint, and migration `20260817142200` is not recorded as applied. The SQL file synced as code, but pushing a migration file to GitHub did **not** execute it against Lovable Cloud.
- Lovable syncs commits from the one active connected branch, normally within a short time. Syncing source code does not automatically republish the public frontend.
- Frontend changes require **Publish / Update** to reach the published app. Backend migrations applied through Lovable deploy immediately.

## Actions

1. **Apply the missing database migration**
   - Replace the stale/missing `procedures.assisted_by` relationship with a foreign key to `staff(id)` using `ON DELETE SET NULL`.
   - Confirm the constraint exists and references `staff` after execution.

2. **Verify the synced frontend behavior**
   - Test procedure creation in the Lovable preview with valid and invalid doctor/assistant selections.
   - Confirm the validation from commit `570df9c` is running and the previous foreign-key error is gone.

3. **Publish the current frontend**
   - Run a security check, then publish/update the current commit so the code reaches the published Lovable URL and custom domain.

4. **Establish the future workflow**
   - Keep Claude Code pushes on the branch currently selected in Lovable Git settings (`main`). Lovable should automatically sync those commits into the editor.
   - After frontend commits sync, use **Publish → Update**; Lovable does not currently auto-deploy the published frontend for every GitHub push.
   - Treat migration files pushed from outside Lovable as pending database work: ask Lovable to apply them through the backend migration flow. Merely committing the SQL file does not run it.
   - If a future commit does not appear in the editor shortly, check that `main` is still the active synced branch, then use the Git settings reconnect/resync flow or make a small Lovable edit to prompt synchronization.

## Expected result

The current staff validation will be active in preview and production, the corrected relationship will exist in the live database, and future GitHub changes will follow a predictable **push → automatic code sync → apply backend migration if any → Publish/Update frontend** workflow.