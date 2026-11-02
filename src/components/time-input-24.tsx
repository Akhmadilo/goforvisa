import { cn } from "@/lib/utils";

/**
 * Always-24h time picker (HH:MM). Native <input type="time"> follows the
 * device locale and may show AM/PM, so we render hour/minute selects instead.
 */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

const selectCls =
  "h-9 rounded-md border border-input bg-background px-2 text-sm tabular-nums shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function TimeInput24({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [hRaw, mRaw] = (value || "").split(":");
  const h = HOURS.includes(hRaw) ? hRaw : "";
  const m = MINUTES.includes(mRaw) ? mRaw : "";
  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <select
        aria-label="Soat"
        className={selectCls}
        value={h}
        disabled={disabled}
        onChange={(e) => onChange(`${e.target.value}:${m || "00"}`)}
      >
        {!h && <option value="">--</option>}
        {HOURS.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <span className="font-medium">:</span>
      <select
        aria-label="Daqiqa"
        className={selectCls}
        value={m}
        disabled={disabled}
        onChange={(e) => onChange(`${h || "00"}:${e.target.value}`)}
      >
        {!m && <option value="">--</option>}
        {MINUTES.map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
    </div>
  );
}
