/**
 * Customer-facing pages: venue gradient, safe area for bottom nav, readable max width.
 */
export function CustomerShell({
  children,
  className = "",
  /** Extra bottom padding when using CustomerBottomNav (e.g. pb-24) */
  bottomInsetClass = "pb-24",
  maxWidthClass = "max-w-lg",
}) {
  return (
    <div className={`customer-shell min-h-screen ${className}`}>
      <div
        className={`mx-auto min-h-screen w-full min-w-0 overflow-x-hidden px-2 pt-2 sm:px-5 sm:pt-4 ${bottomInsetClass} ${maxWidthClass}`}
      >
        {children}
      </div>
    </div>
  );
}
