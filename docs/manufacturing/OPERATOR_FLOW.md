# Manufacturing operator happy path (plain English)

Use floor words first. PDF terms in parentheses.

## Assembly (everyday)

1. Open **Manufacturing** → **Dashboard**.
2. Click **Assembly** (or **+ New production order** → Assembly).
3. **Step 1 — What are you making?** Pick recipe, how many, warehouse. Notes optional.
4. **Save draft** anytime — stock does **not** move yet.
5. **Step 2 — Check parts.** Green = enough. Orange = tight. Red = short (you can still save draft; you cannot Finish until stock is enough).
6. **Step 3 — Finish.** Optional extra costs. Click **Assemble & Post** (Finish build).
7. If the product or parts use serial/lot numbers, the app sends you to **Take materials** and/or **Record finished**, then come back and Finish.
8. When Finish succeeds, parts leave stock and finished goods arrive.

## Cutting / Breakdown

1. Dashboard → **Cutting / Breakdown** (opens the 3-step Cutting wizard).
2. **Step 1 — Raw material.** Pick cutting template, input qty, warehouse. **Save draft** OK without stock move.
3. **Step 2 — Actual outputs.** Enter actual qty per cut (class comes from the cutting template: finished / by-product / waste). For **extra or excess** waste, pick a waste reason. Use **Weigh parts** when lots are required.
4. **Step 3 — Post Production.** Sellable cuts go to stock; **waste class does not** become sellable inventory. Abnormal or excess waste needs a reason (Setup → Waste reasons).

## Recipe / Processing

1. Dashboard → **Recipe / Processing** (opens the 3-step Processing wizard), or sidebar → Recipe / Processing.
2. **Step 1 — Recipe & batch.** Pick a processing recipe, batch qty, warehouse. **Save draft** OK without stock move.
3. **Step 2 — Ingredients.** Green = enough. Orange = tight. Red = short (draft OK; Process & Post blocked until stock is enough).
4. **Step 3 — Process & Post.** Optional estimate costs on the screen. Ingredients leave stock and finished goods arrive when Process & Post succeeds.
5. If serial/lot tracking is on, the app sends you to **Take materials** / **Record finished**, then Finish from Jobs.

Setup: create processing recipes under **Recipe / Processing → recipes** (batch size + yield bands + cost estimates).

## Rules operators should remember

- A draft or started job is **not** a stock change.
- Stock changes only when Finish / Assemble & Post / Post Production / Process & Post succeeds.
- If Finish fails after Start, use **Revert to draft** only when nothing was taken or recorded yet.
