# Custom Fields (portable module)

Zoho/Salesforce-style custom field builder. Copy these three pieces into any org:

1. `src/lib/custom-fields/` — types, field-type catalog, data hooks
2. `src/components/custom-fields/` — runtime renderer + admin field properties dialog
3. `src/pages/CustomFields.tsx` — the admin console page

## Database

Run a migration creating:

- `custom_field_sections` (object_key, name, description, column_count, display_order)
- `custom_fields` (object_key, section_id, column_name, label, field_type, options, is_required,
  is_active, default_value, help_text, placeholder, max_length, decimal_places, display_order)
- `is_admin_staff()` — returns true for signed-in admin staff
- `add_custom_field_column(_table, _column, _sql_type)` and `drop_custom_field_column(_table, _column)`
  — `SECURITY DEFINER` helpers that ALTER the real table. Both validate:
  admin caller, whitelisted table, `^cf_[a-z0-9_]{1,50}$` column name, whitelisted SQL type.

Values are stored in **real columns** (prefixed `cf_`) on the target table, so they work with
reporting, filters and exports out of the box.

## Configuring objects

Edit `CUSTOM_FIELD_OBJECTS` in `types.ts` and mirror the same table list inside the two DB helpers.

## Using fields in a record form

```tsx
const { data: defs = [] } = useCustomFields("patients", true);
const [customValues, setCustomValues] = useState({});

<CustomFieldsRenderer
  objectKey="patients"
  values={customValues}
  onChange={(col, val) => setCustomValues((p) => ({ ...p, [col]: val }))}
  errors={customErrors}
/>

// before save
const errs = validateCustomFields(defs, customValues);
// then spread `customValues` into your insert/update payload
```