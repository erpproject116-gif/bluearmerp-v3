import { formatAmount, formatMoney } from "./money";

export type MoneyCellProps = {
  /** Raw numeric amount from the API. */
  value: number | null | undefined;
  /**
   * true / omit = tenant currency sign (₱…).
   * false = number only (debit/credit columns).
   * string = override sign.
   */
  sign?: boolean | string;
  class?: string;
};

/** Right-aligned money display cell for report/table UIs. */
export function MoneyCell(props: MoneyCellProps) {
  const n = () => (Number.isFinite(props.value as number) ? Number(props.value) : 0);
  const text = () =>
    props.sign === false ? formatAmount(n()) : formatMoney(n(), { sign: props.sign });
  return <td class={`px-3 py-2 text-right tabular-nums ${props.class ?? ""}`.trim()}>{text()}</td>;
}
