import type { ReactNode } from "react";

// Full-screen wrapper for standalone auth pages (forgot / set-password / verify-email / SSO handoff).
// Covers the app chrome so a signed-out visitor sees a clean page, matching /signin and the legal
// pages. Safe in both server and client components (pure markup).
export function AuthShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-background">
      <div className={`mx-auto flex min-h-full max-w-sm flex-col justify-center px-6 ${className}`}>{children}</div>
    </div>
  );
}
