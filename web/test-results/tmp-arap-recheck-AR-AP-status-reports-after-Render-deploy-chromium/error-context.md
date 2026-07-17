# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tmp-arap-recheck.spec.ts >> AR/AP status reports after Render deploy
- Location: e2e\tmp-arap-recheck.spec.ts:11:1

# Error details

```
Error: /app/buying/reports/payable-status: API 5xx during load: 500 GET /api/v1/finance/reports/ar-ap-status?as_of=2026-07-17&status_type=payable&page=1&pageSize=50&sort=partner_name&order=asc
/app/selling/reports/receivable-status: API 5xx during load: 500 GET /api/v1/finance/reports/ar-ap-status?as_of=2026-07-17&status_type=receivable&page=1&pageSize=50&sort=partner_name&order=asc

expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 4

- Array []
+ Array [
+   "/app/buying/reports/payable-status: API 5xx during load: 500 GET /api/v1/finance/reports/ar-ap-status?as_of=2026-07-17&status_type=payable&page=1&pageSize=50&sort=partner_name&order=asc",
+   "/app/selling/reports/receivable-status: API 5xx during load: 500 GET /api/v1/finance/reports/ar-ap-status?as_of=2026-07-17&status_type=receivable&page=1&pageSize=50&sort=partner_name&order=asc",
+ ]
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - complementary [ref=e4]:
      - generic [ref=e6]:
        - generic [ref=e7]:
          - generic [ref=e8]: P
          - paragraph [ref=e10]: Pacific Rim Modular Furnishing Corp.
        - paragraph [ref=e11]: ERP v3
      - paragraph [ref=e13]: Modules
      - navigation [ref=e14]:
        - link "Business Dashboard" [ref=e15] [cursor=pointer]:
          - /url: /app/dashboard
          - img [ref=e17]
          - generic [ref=e19]: Business Dashboard
        - button "Stock" [ref=e21]:
          - generic [ref=e22]: ▶
          - generic [ref=e23]: Stock
        - generic [ref=e24]:
          - button "Selling" [ref=e25]:
            - generic [ref=e26]: ▶
            - generic [ref=e27]: Selling
          - generic [ref=e28]:
            - link "Selling" [ref=e29] [cursor=pointer]:
              - /url: /app/selling
              - img [ref=e31]
              - generic [ref=e33]: Selling
            - link "Quotation" [ref=e34] [cursor=pointer]:
              - /url: /app/quotation/quotations
              - img [ref=e36]
              - generic [ref=e38]: Quotation
            - link "Sales Order" [ref=e39] [cursor=pointer]:
              - /url: /app/sales-order/sales-orders
              - img [ref=e41]
              - generic [ref=e43]: Sales Order
            - link "Sales" [ref=e44] [cursor=pointer]:
              - /url: /app/sales/sales
              - img [ref=e46]
              - generic [ref=e48]: Sales
            - link "Group / Tax Invoicing" [ref=e49] [cursor=pointer]:
              - /url: /app/sales/collective-invoicing/list
              - generic [ref=e50]: Group / Tax Invoicing
        - generic [ref=e51]:
          - button "Buying" [ref=e52]:
            - generic [ref=e53]: ▶
            - generic [ref=e54]: Buying
          - generic [ref=e55]:
            - link "Buying" [ref=e56] [cursor=pointer]:
              - /url: /app/buying
              - img [ref=e58]
              - generic [ref=e60]: Buying
            - link "Purchase Request" [ref=e61] [cursor=pointer]:
              - /url: /app/purchase-request/purchase-requests
              - img [ref=e63]
              - generic [ref=e65]: Purchase Request
            - link "Purchase Order" [ref=e66] [cursor=pointer]:
              - /url: /app/purchase-order/purchase-orders
              - img [ref=e68]
              - generic [ref=e70]: Purchase Order
            - link "Purchases" [ref=e71] [cursor=pointer]:
              - /url: /app/purchases/purchases
              - img [ref=e73]
              - generic [ref=e75]: Purchases
        - generic [ref=e76]:
          - button "Accounting Dept" [ref=e77]:
            - generic [ref=e78]: ▶
            - generic [ref=e79]: Accounting Dept
          - generic [ref=e80]:
            - link "Finance" [ref=e81] [cursor=pointer]:
              - /url: /app/finance
              - img [ref=e83]
              - generic [ref=e85]: Finance
            - link "Acct. I" [ref=e86] [cursor=pointer]:
              - /url: /app/finance/acct-i/journal-entries
              - generic [ref=e87]: Acct. I
            - link "Acct. II" [ref=e88] [cursor=pointer]:
              - /url: /app/finance/acct-ii/checks
              - generic [ref=e89]: Acct. II
            - link "Taxes" [ref=e90] [cursor=pointer]:
              - /url: /app/quotation/tax-mngt/tax-types
              - generic [ref=e91]: Taxes
            - link "AP Review" [ref=e92] [cursor=pointer]:
              - /url: /app/finance/payment-vouchers
              - generic [ref=e93]: AP Review
        - button "Setup" [ref=e95]:
          - generic [ref=e96]: ▶
          - generic [ref=e97]: Setup
        - link "CRM" [ref=e98] [cursor=pointer]:
          - /url: /app/crm/dashboard
          - img [ref=e100]
          - generic [ref=e102]: CRM
        - link "Communications" [ref=e103] [cursor=pointer]:
          - /url: /app/comms/sent-documents
          - img [ref=e105]
          - generic [ref=e107]: Communications
        - link "Project Management" [ref=e108] [cursor=pointer]:
          - /url: /app/operations
          - img [ref=e110]
          - generic [ref=e112]: Project Management
        - link "Quality" [ref=e113] [cursor=pointer]:
          - /url: /app/quality/ncrs
          - img [ref=e115]
          - generic [ref=e117]: Quality
        - link "Support" [ref=e118] [cursor=pointer]:
          - /url: /app/support/tickets
          - img [ref=e120]
          - generic [ref=e122]: Support
        - link "POS" [ref=e123] [cursor=pointer]:
          - /url: /app/pos
          - img [ref=e125]
          - generic [ref=e127]: POS
        - link "HR & Payroll" [ref=e128] [cursor=pointer]:
          - /url: /app/hr/employees
          - img [ref=e130]
          - generic [ref=e132]: HR & Payroll
      - generic [ref=e133]:
        - generic [ref=e134]:
          - generic [ref=e135]:
            - generic [ref=e136]: Active business
            - paragraph [ref=e137]: Pacific Rim Modular Furnishing Corp.
          - generic [ref=e138]:
            - generic [ref=e139]: Active branch
            - combobox [ref=e140]:
              - option "CEZ Finishing & QC Bay" [selected]
              - option "CEZ Main Assembly Plant"
              - option "Clark Freeport Showroom"
              - option "Head Office — Makati"
              - option "Mobile Install Crew (NCR)"
              - option "Subcon — O/E Metal Frames (Batangas)"
              - option "Subcon — O/E Sofa Line (Laguna)"
              - option "Warehouse Bay 10"
              - option "Warehouse Bay 11"
              - option "Warehouse Bay 12"
              - option "Warehouse Bay 13"
              - option "Warehouse Bay 14"
              - option "Warehouse Bay 15"
              - option "Warehouse Bay 16"
              - option "Warehouse Bay 17"
              - option "Warehouse Bay 18"
              - option "Warehouse Bay 20"
              - option "Warehouse Bay 21"
              - option "Warehouse Bay 22"
              - option "Warehouse Bay 23"
              - option "Warehouse Bay 24"
              - option "Warehouse Bay 25"
              - option "Warehouse Bay 26"
              - option "Warehouse Bay 27"
              - option "Warehouse Bay 28"
              - option "Warehouse Bay 29"
              - option "Warehouse Bay 30"
              - option "Warehouse Bay 31"
              - option "Warehouse Bay 32"
              - option "Warehouse Bay 33"
              - option "Warehouse Bay 34"
              - option "Warehouse Bay 35"
              - option "Warehouse Bay 36"
              - option "Warehouse Bay 37"
              - option "Warehouse Bay 39"
              - option "Warehouse Bay 40"
              - option "Warehouse Bay 41"
              - option "Warehouse Bay 42"
              - option "Warehouse Bay 43"
              - option "Warehouse Bay 44"
              - option "Warehouse Bay 45"
              - option "Warehouse Bay 46"
              - option "Warehouse Bay 47"
              - option "Warehouse Bay 48"
              - option "Warehouse Bay 49"
              - option "Warehouse Bay 50"
              - option "Warehouse Bay 51"
              - option "Warehouse Bay 52"
              - option "Warehouse Bay 53"
              - option "Warehouse Bay 54"
              - option "Warehouse Bay 55"
              - option "Warehouse Bay 56"
              - option "Warehouse Bay 58"
              - option "Warehouse Bay 59"
              - option "Warehouse Bay 60"
              - option "Warehouse Bay 61"
              - option "Warehouse Bay 62"
              - option "Warehouse Bay 63"
              - option "Warehouse Bay 64"
              - option "Warehouse Bay 65"
              - option "Warehouse Bay 66"
              - option "Warehouse Bay 67"
              - option "Warehouse Bay 68"
              - option "Warehouse Bay 69"
              - option "Warehouse Bay 70"
              - option "Warehouse Bay 71"
              - option "Warehouse Bay 72"
              - option "Warehouse Bay 73"
              - option "Warehouse Bay 74"
              - option "Warehouse Bay 75"
              - option "Warehouse Bay 77"
              - option "Warehouse Bay 78"
              - option "Warehouse Bay 79"
              - option "Warehouse Bay 80"
              - option "Warehouse Bay 81"
              - option "Warehouse Bay 82"
              - option "Warehouse Bay 83"
              - option "Warehouse Bay 84"
              - option "Warehouse Bay 85"
              - option "Warehouse Bay 86"
              - option "Warehouse Bay 87"
              - option "Warehouse Bay 88"
              - option "Warehouse Bay 9"
        - button "DO Demo Owner" [ref=e142]:
          - generic "Demo Owner" [ref=e143]: DO
          - generic [ref=e144]: Demo Owner
          - img [ref=e145]
        - button "Collapse sidebar" [ref=e147]:
          - img [ref=e148]
          - generic [ref=e150]: Collapse
    - generic [ref=e151]:
      - banner [ref=e152]:
        - generic [ref=e153]:
          - generic [ref=e154]:
            - paragraph [ref=e155]: Selling
            - heading "Receivable Status" [level=1] [ref=e156]
          - generic [ref=e157]:
            - button "Only you" [ref=e159]:
              - generic [ref=e160]: Only you
            - button "+ CRM task" [ref=e162]
            - button "Notifications" [ref=e164]:
              - img [ref=e165]
              - generic [ref=e167]: "4"
        - generic [ref=e168]:
          - generic [ref=e169]:
            - paragraph [ref=e170]: Workspace setup incomplete (22%)
            - paragraph [ref=e171]: "Next: Set your company name and logo. Sales documents can be saved; finish setup for purchases, POS, and auto-posting."
          - generic [ref=e172]:
            - link "Continue setup" [ref=e173] [cursor=pointer]:
              - /url: /app/setup/company
            - button "Remind me later" [ref=e174]
        - navigation "Selling features" [ref=e175]:
          - link "Workspace" [ref=e176] [cursor=pointer]:
            - /url: /app/selling
          - link "Sales Status" [ref=e177] [cursor=pointer]:
            - /url: /app/selling/reports
          - link "Receivable Status" [ref=e178] [cursor=pointer]:
            - /url: /app/selling/reports/receivable-status
      - main [ref=e179]:
        - generic [ref=e180]:
          - generic [ref=e181]:
            - paragraph [ref=e182]: Sample / demo workspace
            - paragraph [ref=e183]:
              - text: This business (DEMO000) may include sample partners, items, and documents. Do not treat them as live customer data. Clear sample documents (and optionally masters) under
              - link "User Management → Demo data" [ref=e184] [cursor=pointer]:
                - /url: /app/user-management/demo-data
              - text: .
          - button "Dismiss" [ref=e185]
        - 'region "Workflow guide: Selling — from quote to getting paid" [ref=e186]':
          - generic [ref=e187]:
            - generic [ref=e188]:
              - generic [ref=e189]: Guide
              - paragraph [ref=e190]: Selling — from quote to getting paid
            - generic "Workflow steps" [ref=e191]:
              - link "1. Quotation" [ref=e192] [cursor=pointer]:
                - /url: /app/quotation/quotations
              - generic [ref=e193]: →
              - link "2. Sales Order" [ref=e194] [cursor=pointer]:
                - /url: /app/sales-order/sales-orders
              - generic [ref=e195]: →
              - link "3. Deliver" [ref=e196] [cursor=pointer]:
                - /url: /app/sales-order/sales-orders/release
              - generic [ref=e197]: →
              - link "4. Sales Invoice" [ref=e198] [cursor=pointer]:
                - /url: /app/sales/sales
              - generic [ref=e199]: →
              - link "5. Payment" [ref=e200] [cursor=pointer]:
                - /url: /app/finance/official-receipts
            - generic [ref=e201]:
              - generic [ref=e202]: You are on step 4 of 5
              - button "Show me how" [ref=e203]
        - generic [ref=e204]:
          - generic [ref=e205]:
            - heading "Receivable Status" [level=2] [ref=e206]
            - paragraph [ref=e207]: Open customer balances as of the date below. Balances come from Sales minus Official Receipt applications (CoA invoice mapping is optional for this report).
            - generic [ref=e209]:
              - generic [ref=e210]: As-of date
              - textbox "As-of date" [ref=e211]: 2026-07-17
            - generic [ref=e212]:
              - button "Search (F8)" [ref=e213]
              - button "Reset" [ref=e214]
          - generic [ref=e215]:
            - generic [ref=e216]: Open receivable balance as of 2026-07-17
            - table [ref=e218]:
              - rowgroup [ref=e219]:
                - row "Customer Kind Open balance" [ref=e220]:
                  - columnheader "Customer" [ref=e221]
                  - columnheader "Kind" [ref=e222]
                  - columnheader "Open balance" [ref=e223]
              - rowgroup
              - rowgroup [ref=e224]:
                - row "Total (0 partners) ₱0.00" [ref=e225]:
                  - cell "Total (0 partners)" [ref=e226]
                  - cell "₱0.00" [ref=e227]
            - generic [ref=e228]:
              - generic [ref=e229]: Page 1 / 1
              - generic [ref=e230]:
                - button "Prev" [disabled] [ref=e231]
                - button "Next" [disabled] [ref=e232]
                - button "Export CSV" [ref=e233]
  - generic [ref=e234]:
    - generic [ref=e235]:
      - generic [ref=e236]:
        - generic [ref=e237]:
          - paragraph [ref=e238]: Getting started
          - heading "Welcome — let's set up your workspace" [level=2] [ref=e239]
        - button "Minimize onboarding guide" [ref=e240]:
          - img [ref=e241]
      - generic [ref=e243]:
        - generic [ref=e244]: Progress
        - generic [ref=e245]: 22%
    - generic [ref=e248]:
      - paragraph [ref=e249]: Set your company name in branding — it appears on invoices, purchase slips, and reports.
      - list [ref=e250]:
        - listitem [ref=e251]:
          - generic [ref=e253]: Set your company name and logo
        - listitem [ref=e254]:
          - generic [ref=e256]: Set up your chart of accounts
        - listitem [ref=e257]:
          - generic [ref=e259]: Confirm currency and tax types
        - listitem [ref=e260]:
          - generic [ref=e262]: Review process policies
      - link "Set your company name and logo" [ref=e264] [cursor=pointer]:
        - /url: /app/setup/company
      - button "Remind me later" [ref=e265]
  - toolbar "Help and support shortcuts" [ref=e266]:
    - button "Open new support ticket" [ref=e267]:
      - img [ref=e268]
    - button "Open help assistant" [ref=e272]:
      - generic [ref=e273]: "?"
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import { demoAuthAvailable, demoSignIn } from "./helpers/demoSignIn";
  3  | import { assertApiReachable } from "./helpers/apiReady";
  4  | import { visitAppRoute } from "./helpers/appRoutes";
  5  | 
  6  | const routes = [
  7  |   "/app/buying/reports/payable-status",
  8  |   "/app/selling/reports/receivable-status",
  9  | ];
  10 | 
  11 | test("AR/AP status reports after Render deploy", async ({ page }) => {
  12 |   test.skip(!demoAuthAvailable(), "Set E2E_BENCH_TOKEN or E2E_DEMO_PASSWORD");
  13 |   await demoSignIn(page);
  14 |   await assertApiReachable(page);
  15 |   const fails: string[] = [];
  16 |   for (const path of routes) {
  17 |     const r = await visitAppRoute(page, path);
  18 |     if (!r.ok) fails.push(`${path}: ${r.detail ?? "failed"}`);
  19 |   }
> 20 |   expect(fails, fails.join("\n")).toEqual([]);
     |                                   ^ Error: /app/buying/reports/payable-status: API 5xx during load: 500 GET /api/v1/finance/reports/ar-ap-status?as_of=2026-07-17&status_type=payable&page=1&pageSize=50&sort=partner_name&order=asc
  21 | });
  22 | 
```