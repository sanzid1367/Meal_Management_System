# Design System: MessSync

This document governs the branding guidelines, color palettes, visual tokens, typography, and specific usability constraints for the MessSync product workspace.

## Aesthetic Theme: Technical OLED Dark Mode
- **Mood**: Precise, clean, data-intensive, night-friendly.
- **Palette**:
  - **Background**: `#181715` (deep charcoal black)
  - **Primary / Accent**: `#cc785c` (warm bronze)
  - **Secondary / Card**: `#252320`
  - **Borders & Inputs**: `#5c5751`
  - **Success / Badge**: `#5db872` (emerald green)
  - **Destructive**: `#ff7b7b` (soft red)
  - **Text (Active)**: `#faf9f5`
  - **Text (Muted)**: `#c2bfb8`

## Typography
- **Heading Fonts**: `Inter` (sans-serif) for general interface buttons, section text, and metrics.
- **Data Fonts**: `JetBrains Mono` / monospace for tabular records, meal grids, currency logs, and math calculations.

## User Interface & Usability Rules

### 1. View-Mode Restrictions (Viewer vs Admin)
- In viewer mode (non-admin), completely hide the "Actions" column header and row buttons.
- Omit action forms and CRUD triggers (e.g. "Add Deposit", "Close Month") from view-only interfaces.

### 2. High-Density Tables & Collapsible Panels
- Maintain a collapsible sidebar (`isSidebarCollapsed` / `isMobileOpen` states) to maximize width. When collapsed, tables have full width to avoid unnecessary wrapping.
- Provide responsive horizontal scrolling for tables on mobile.

### 3. Aggregates & Table Footers
- Always display a table footer (`<tfoot>`) showing bold sum totals for numeric currency columns (e.g., expenses and deposits tables).

### 4. Icons & Hover Elements
- Use high-quality SVG icons from Lucide. Never use raw emojis as UI action icons.
- Add `cursor-pointer` explicitly on all clickable items, list rows, and interactive buttons.
