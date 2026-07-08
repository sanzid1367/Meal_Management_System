# Design System: MessSync (Bentley Motors Theme)

This document governs the branding guidelines, color palettes, visual tokens, typography, and specific usability constraints for the MessSync product workspace.

## Aesthetic Theme: Bentley Luxury Dark Mode
- **Mood**: Precise, restrained, ultra-luxury, high-contrast.
- **Palette**:
  - **Background Canvas**: `#040404` (near-black structural tone)
  - **Primary / Accent**: `#394d45` (Bentley Race Green — sole chromatic brand accent)
  - **Secondary / Card**: `#0c0c0b` (dark slate card)
  - **Borders & Inputs**: `#2a2a29` (hairline dark border)
  - **Success / Badge**: `#5db872` (emerald green)
  - **Destructive**: `#ff7b7b` (soft red)
  - **Text (Active)**: `#ffffff` (pure white)
  - **Text (Muted)**: `#a6a6a6` (muted gray)

## Geometry
- **Border Radius**: Unified **rectangular and slightly rounded** (`rounded-lg` / `rounded-md` / `6px` to `8px` curves). 
- All capsule/pill shapes (`rounded-full`, `rounded-4xl`, etc.) are replaced with slightly rounded rectangular borders. Circular shapes are only used for graphic details (e.g. background blur gradients).

## Typography
- **Heading & Body Fonts**: `Bentley` / `Inter` running at **weight 300** (font-light / font-thin) across display, heading, and body tiers to signal luxury and restraint. No bold weights are used for headlines or displays.
- **Data Fonts**: `JetBrains Mono` / monospace for tabular records, meal grids, currency logs, and math calculations.
- **Uppercase Labels**: `label-caps` runs at weight 400 with 1.3px letter-spacing for category headers and navigation chips.

## User Interface & Usability Rules

### 1. View-Mode Restrictions (Viewer vs Admin)
- In viewer mode (non-admin), completely hide the "Actions" column header and row buttons.
- Omit action forms and CRUD triggers (e.g. "Add Deposit", "Close Month") from view-only interfaces.

### 2. High-Density Tables & Collapsible Panels
- Maintain a collapsible sidebar to maximize width. When collapsed, tables have full width to avoid unnecessary wrapping.
- Provide responsive horizontal scrolling for tables on mobile.

### 3. Aggregates & Table Footers
- Always display a table footer (`<tfoot>`) showing sum totals for numeric currency columns.

### 4. Icons & Hover Elements
- Use high-quality SVG icons from Lucide. Never use raw emojis.
- Add `cursor-pointer` explicitly on all clickable items, list rows, and interactive buttons.
