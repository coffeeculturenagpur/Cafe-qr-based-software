# Full-width kitchen service toolbar

Update `next-frontend/app/kitchen/page.js`.

Remove any visible “Service controls” heading/label from the toolbar. Make the remaining six controls (live status, Refresh, Enable alerts, History, Manual order, Manual cigarette order) use the full available width in a clean flex layout. Keep their current order, actions, labels, icons, colors, and responsive behavior. On desktop, distribute the controls evenly with consistent gaps; on smaller screens let them wrap into usable rows without overflow. Use minimum 42px touch height. Do not change the revenue card, stat card grid, or other dashboard content.

Run `npm.cmd run build` after editing.
