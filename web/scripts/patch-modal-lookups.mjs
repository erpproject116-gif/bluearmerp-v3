/**
 * Patches document modals to use cached useActiveTaxTypes / useActiveCurrencies.
 * Run: node scripts/patch-modal-lookups.mjs
 */
import fs from "node:fs";
import path from "node:path";

const files = [
  "src/modules/quotation/quotation/QuotationModal.tsx",
  "src/modules/sales-order/sales-order/SalesOrderModal.tsx",
  "src/modules/purchase-request/purchase-request/PurchaseRequestModal.tsx",
  "src/modules/finance/supplier-invoices/SupplierInvoiceModal.tsx",
];

const importHook =
  'import { useActiveCurrencies, useActiveTaxTypes } from "../../../shared/useDocumentLookups";';

for (const rel of files) {
  const file = path.join(process.cwd(), rel);
  let src = fs.readFileSync(file, "utf8");
  if (!src.includes("useDocumentLookups")) {
    src = src.replace(
      /import type \{ TaxTypeRow \} from "\.\.\/\.\.\/\.\.\/shared\/useTaxTypeList";/,
      `import type { TaxTypeRow } from "../../../shared/useTaxTypeList";\n${importHook}`,
    );
  }

  src = src.replace(
    /async function fetchTaxTypes\(\): Promise<TaxTypeRow\[\]> \{[\s\S]*?\}\n\nasync function fetchCurrencies\(\): Promise<[\s\S]*?\}\n\n/,
    "",
  );

  src = src.replace(
    /const \[taxTypes, setTaxTypes\] = createSignal<TaxTypeRow\[\]>\(\[\]\);\n  const \[currencies, setCurrencies\] = createSignal<\{ id: number; currency_code: string; name: string; is_default: boolean \}\[\]>\(\[\]\);\n/,
    `const taxTypesQuery = useActiveTaxTypes(() => props.open);\n  const currenciesQuery = useActiveCurrencies(() => props.open);\n  const taxTypes = () => taxTypesQuery.data ?? [];\n  const currencies = () => currenciesQuery.data ?? [];\n`,
  );

  src = src.replace(
    /  const loadLookups = async \(\) => \{[\s\S]*?  \};\n\n/,
    "",
  );

  src = src.replace(/    void loadLookups\(\);\n/, "");

  if (!src.includes("applyNewDocumentLookupDefaults")) {
    src = src.replace(
      /(createEffect\(\(\) => \{\n    if \(props\.open && !props\.editing\) void loadPreview\(orderDate\(\)\);\n  \}\);)/,
      `  createEffect(() => {
    if (!props.open || props.editing) return;
    const tt = taxTypes();
    const cc = currencies();
    if (!tt.length || !cc.length) return;
    if (!taxTypeId()) {
      const first = tt[0];
      setTaxTypeId(first.id);
    }
    if (!currencyId()) {
      const def = cc.find((c) => c.is_default) ?? cc[0];
      if (def) setCurrencyId(def.id);
    }
  });

  $1`,
    );
  }

  fs.writeFileSync(file, src);
  console.log("patched", rel);
}
