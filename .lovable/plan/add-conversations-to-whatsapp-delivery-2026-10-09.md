# Add Conversations to WhatsApp Delivery

## Scope

Keep `/whatsapp-log`, its title, subtitle, access protection, and existing delivery log unchanged. Add only:

- Tabs on `src/pages/WhatsAppLog.tsx`, defaulting to **Delivery**.
- A new read-only `src/components/shared/WhatsAppConversations.tsx` component under **Conversations**.

No new route, module, database object, backend function, sending control, or change to the webhook or the Trayi Jewellers project.

## Page changes

1. Wrap the existing `<WhatsAppDeliveryLog />` in the app’s shadcn tabs:
   - **Delivery**: render the existing component unchanged.
   - **Conversations**: render the new conversation reader.
2. Preserve the current page heading and subtitle exactly.
3. Keep the existing `campaigns` access rule where it is; this change stays inside the already-protected page.

## Conversation reader

- Add a compact filter row above the reader:
  - Search by patient name or phone.
  - Date-range preset using the app’s existing report periods, with the shared date inputs for a custom range.
  - No additional filters.
- Build a card with two panes:
  - **Conversation list:** one visible entry per phone, newest activity first; show linked patient name or fallback phone, one-line latest message, latest time, message count, and a semantic waiting marker when the latest message is inbound.
  - **Selected thread:** linked patient heading when known; messages ordered oldest to newest, grouped by day; inbound on the left in a muted bubble and outbound on the right in a primary bubble; time on every message.
- Selecting a conversation fetches that phone’s history separately and scrolls the thread to its newest loaded message.
- On mobile, stack the list above the selected thread without changing the desktop two-pane style.
- Include loading, query-error, no-conversations, no-search-results, and empty-thread states.

## Data and paging

- Read only from `whatsapp_conversations` and join `patients(first_name, last_name)` for known patients.
- Page the conversation source in descending `created_at` order with bounded batches, deduplicating phones as pages arrive; provide a clear **Load more** action rather than loading all messages at once.
- Fetch only the selected phone’s messages for the right pane, in bounded pages. Show the newest page first and allow staff to load earlier messages while preserving oldest-to-newest display order.
- Apply search and date bounds to the database queries. For name search, resolve matching patient IDs and combine those with phone matches without fetching the patient table wholesale.
- Use stable query keys containing the search and date range so changing filters cannot show stale results.

## Visual and interaction details

- Reuse existing cards, inputs, buttons, tabs, links, semantic theme colours, spacing, and date formatting.
- Link known patient names to `/patients/:patientId`.
- Use no reply field, send action, new colour, font, layout language, or custom animation.
- Keep the waiting state accessible through text/icon treatment, not colour alone.

## Verification

- Confirm the Delivery tab remains the default and its current table and controls behave unchanged.
- Confirm conversation paging, search by phone/name, date filtering, waiting markers, patient links, day separators, selected-thread paging, and newest-message scrolling.
- Check desktop and mobile layouts, including empty and no-match states.
- Run the focused TypeScript check and inspect the current preview build/runtime logs.
