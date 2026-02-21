# PALETTE'S JOURNAL - CRITICAL LEARNINGS ONLY

## 2025-02-18 - Accessibility of Dynamic Lists
**Learning:** When displaying lists of dynamic items (like attachments), generic labels like "Remove" are insufficient for screen reader users. Including the item name (e.g., "Remove [filename]") provides critical context.
**Action:** Always include the item's unique identifier or name in the `aria-label` of action buttons within a list.
