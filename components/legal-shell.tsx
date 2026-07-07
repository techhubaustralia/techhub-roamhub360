import type { ReactNode } from "react";
import { RoamHubMark } from "@/components/roamhub-mark";
import { brand } from "@/lib/brand";

// Full-screen wrapper for public legal pages (privacy / terms) — covers the app chrome so an
// unauthenticated visitor sees a clean, standalone document.
export function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] overflow-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        <div className="mb-8 flex items-center gap-2.5">
          <RoamHubMark className="size-8" />
          <div className="font-heading text-[15px] font-bold">{brand.productName}</div>
        </div>
        <h1 className="font-heading text-[26px] font-bold">{title}</h1>
        <p className="mt-1 text-[12.5px] text-txt-mute">A {brand.company} product.</p>
        <div className="legal prose mt-6 flex flex-col gap-3 text-[13.5px] leading-relaxed text-txt-dim [&_h2]:mt-6 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-foreground [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_b]:text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}
