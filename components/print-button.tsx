"use client";

// A print trigger for the QR label sheet. The page's print CSS (globals.css) hides app chrome so
// only the label grid prints.
export function PrintButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      Print labels
    </button>
  );
}
