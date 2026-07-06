import { cn } from "@/lib/utils";

type Variant = "ok" | "soon" | "rec" | "bad";

const styles: Record<Variant, string> = {
  ok: "bg-ok/15 text-ok",
  soon: "bg-amber/15 text-amber",
  rec: "bg-violet/15 text-violet",
  bad: "bg-destructive/15 text-destructive",
};

export function StatusPill({
  children,
  variant = "ok",
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  return (
    <span
      className={cn(
        "whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold",
        styles[variant],
      )}
    >
      {children}
    </span>
  );
}
