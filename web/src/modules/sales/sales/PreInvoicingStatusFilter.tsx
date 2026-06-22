import { SalesStatusFilter } from "./SalesStatusFilter";
import { defaultStatusFilters, type SalesStatusFilters } from "./salesStatusFilters";

type Props = {
  value: () => SalesStatusFilters;
  onChange: (next: SalesStatusFilters) => void;
  onSearch: () => void;
  onReset: () => void;
};

export function PreInvoicingStatusFilter(props: Props) {
  return (
    <SalesStatusFilter
      value={props.value}
      onChange={props.onChange}
      onSearch={props.onSearch}
      onReset={props.onReset}
      title="Pre-invoicing Status"
      subtitle="Not yet invoiced — set filters, then Search (F8)."
    />
  );
}

export { defaultStatusFilters };
