import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  delta,
  deltaType = "up",
}: {
  label: string;
  value: string;
  delta?: string;
  deltaType?: "up" | "down" | "flat";
}) {
  return (
    <Card className="gap-0 p-[17px]">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-txt-mute">
        {label}
      </div>
      <div className="mb-0.5 mt-1.5 font-heading text-[29px] font-extrabold tracking-[-1px]">
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            "text-[12.5px] font-semibold",
            deltaType === "up" && "text-ok",
            deltaType === "down" && "text-destructive",
            deltaType === "flat" && "text-txt-mute",
          )}
        >
          {delta}
        </div>
      )}
    </Card>
  );
}
