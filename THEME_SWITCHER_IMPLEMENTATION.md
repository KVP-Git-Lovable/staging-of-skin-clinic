# Theme Switcher Implementation Guide

## Overview
A theme switching feature has been added to the Quick Clinic app dashboard that allows users to select between three distinct themes. The selected theme is persisted per user in the database.

## Features Implemented

### 1. **Three Theme Options**
- **Amber Theme (Default)**
  - Greyish sidebar background
  - Orange & light-black gradient header for logo area
  - Orange primary buttons and accents
  
- **Blue & Black Theme (Current/Original)**
  - Black sidebar background
  - Blue primary buttons and accents
  - Original theme colors preserved
  
- **Light Pink Theme**
  - Greyish sidebar background
  - Light pink & purple gradient header for logo area
  - Pink/strawberry pink primary buttons and accents

### 2. **User Interface**
- **Theme Selector Button**: Palette icon (🎨) in the dashboard header next to the bell icon
- **Dropdown Menu**: Shows three theme options with:
  - Emoji indicators (🟠 🔵 🩷)
  - Theme name and description
  - Active theme indicator (dot)
  - Tooltip on hover showing "Themes"
  
### 3. **Persistence**
- User theme preference is stored in the database (`staff` table)
- Theme persists across sessions for each logged-in user
- Default theme is "amber" for new users

### 4. **Theme Application**
- Dynamic CSS variable updates applied to the root element
- Affects sidebar, buttons, accents, and UI components
- Smooth transitions when switching themes
- Toast notifications confirm theme changes

## Files Modified/Created

### New Files
1. **`src/hooks/useTheme.tsx`**
   - Custom React hook for theme management
   - Loads user theme from database
   - Provides theme context
   - Handles theme persistence

2. **`src/components/theme/ThemeSelector.tsx`**
   - Theme switcher UI component
   - Dropdown menu with theme options
   - Emoji icons and tooltips

3. **`supabase/migrations/20260804144901_c0796b28-455a-44a0-aac0-3c3b009d6dd9.sql`**
   - Database migration adding `theme_preference` column to `staff` table
   - Default value: 'amber'
   - Validation constraint ensures only valid theme values

### Modified Files
1. **`src/App.tsx`**
   - Added `ThemeProvider` wrapper around auth provider
   - Imports theme hook

2. **`src/components/layout/AppLayout.tsx`**
   - Added `ThemeSelector` component to header
   - Imported theme selector

3. **`src/components/layout/AppSidebar.tsx`**
   - Added `theme-header` class to sidebar header
   - Applies gradient background based on active theme

4. **`src/index.css`**
   - Added `.theme-header` component class
   - Applies theme-specific gradient backgrounds

## CSS Variables Used

### Theme-Specific Variables
```
--sidebar-background: Sidebar background color
--sidebar-foreground: Sidebar text color
--sidebar-accent: Sidebar accent/hover color
--sidebar-accent-foreground: Sidebar accent text color
--primary: Primary button and accent color
--primary-foreground: Primary button text color
--sidebar-header-bg: Gradient background for logo area
```

## Database Schema

### New Column: `staff.theme_preference`
```sql
ALTER TABLE staff ADD COLUMN theme_preference TEXT DEFAULT 'amber' 
CHECK (theme_preference IN ('amber', 'blue-black', 'light-pink'));
```

## Usage

### For End Users
1. Click the Palette (🎨) icon in the dashboard header
2. Select desired theme from dropdown menu
3. Theme applies immediately and persists on next login

### For Developers
```typescript
// Use the theme hook in components
import { useTheme } from '@/hooks/useTheme';

function MyComponent() {
  const { theme, setTheme, loading } = useTheme();
  
  if (loading) return <div>Loading theme...</div>;
  
  return (
    <button onClick={() => setTheme('light-pink')}>
      Switch to Light Pink
    </button>
  );
}
```

## Notes

- Theme selector only appears in the authenticated dashboard
- Theme changes are applied dynamically without page reload
- User theme preference is retrieved on app load
- Default theme is "amber" for new users
- All theme colors are configurable via CSS variables
- Icon colors in sidebar menu items can be further customized (TODO: awaiting second screenshot from user for icon color specifications)

## Testing

To test the theme switcher:
1. Log in to the dashboard
2. Look for the Palette icon (🎨) in the header near the bell icon
3. Click to open theme selector dropdown
4. Select different themes and observe changes
5. Refresh page to verify theme persistence
6. Log out and back in to confirm theme was saved

## Future Enhancements

- Custom color picker for advanced users
- Export/import theme configurations
- Team-wide theme settings (if admin feature is desired)
- Dark mode support for themes
- Animated theme transitions
