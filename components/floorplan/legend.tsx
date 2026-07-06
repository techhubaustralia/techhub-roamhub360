const ITEMS = [
  { c: "#2fb350", b: "#269342", label: "Available" },
  { c: "#dc5b43", b: "#b8462f", label: "Booked" },
  { c: "#9aa7ad", b: "#7d8a90", label: "Locked / disabled" },
  { c: "rgba(41,197,238,0.12)", b: "#29C5EE", label: "Selected" },
];

export function Legend() {
  return (
    <div className="rounded-[14px] border bg-card p-4 shadow-sm">
      <h3 className="mb-3 font-heading text-[13px] font-bold">Legend</h3>
      {ITEMS.map((it) => (
        <div key={it.label} className="mb-2 flex items-center gap-2.5 text-[12.5px] text-txt-dim">
          <span className="size-3.5 shrink-0 rounded-[5px] border-2" style={{ background: it.c, borderColor: it.b }} />
          {it.label}
        </div>
      ))}
      <p className="mt-1 text-[11.5px] text-txt-mute">Status reflects the selected date. Switch tabs for desks, rooms and offices.</p>
    </div>
  );
}
