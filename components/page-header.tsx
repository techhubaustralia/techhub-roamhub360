import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-[18px] flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-[13.5px] text-txt-dim">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
