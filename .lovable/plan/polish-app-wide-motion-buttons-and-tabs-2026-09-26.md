# Polish app-wide motion, buttons, and tabs

## What will change
- Refine the shared button styles with subtle depth, cleaner focus states, and quick press feedback.
- Refine shared tabs with a lighter glass surface, clearer active state, and smooth state transitions.
- Add a short fade-and-rise transition when moving between clinic pages.
- Add restrained polish to common clickable controls and form focus states so older screens feel consistent.
- Respect reduced-motion settings and use only CSS transitions to avoid slowing the app.

## What will stay the same
- No page layouts, navigation, wording, workflows, data, or business rules will change.
- The existing mint/teal clinic palette and compact information density will remain.

## Technical details
- Update shared design tokens and reusable controls rather than editing every page separately.
- Scope the page transition to the clinic content area and key it by the current address.
- Verify the appointment details screen at desktop and mobile sizes, then check the latest build result.
