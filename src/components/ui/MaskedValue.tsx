import { maskNumber } from "@/lib/format";

// §4 Masked values: "Maybank ••4821". Never render a full bank or IC number in lists (§5).
export function MaskedValue({
  prefix,
  value,
  visible = 4,
}: {
  /** Bank name or document type shown before the mask, e.g. "Maybank". */
  prefix?: string;
  /** The full number. Only the last `visible` digits are rendered. */
  value: string;
  visible?: number;
}) {
  return (
    <span className="whitespace-nowrap tabular-nums">
      {prefix ? `${prefix} ` : null}
      {maskNumber(value, visible)}
    </span>
  );
}
