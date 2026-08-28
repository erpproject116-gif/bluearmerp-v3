# PO interview — “What feels implemented wrong?”

Use in the **Ops comparison workshop**. For each answer: **Match / Gap / Wrong for us**.  
Wrong + Observed product behavior = product decision (not a docs bug).

**Open while interviewing:**

| Resource | Path / page |
|----------|-------------|
| Guided click order | [11-GUIDED-NAVIGATION…](11-GUIDED-NAVIGATION-SCENARIOS.md) |
| Policies & gates | `/app/user-management/process-policies` · [05 policies](../05-PROCESS-POLICIES-AND-GATES.md) |
| Workshop table | Notion → **7. Ops comparison workshop** |
| Forms hub | [17 hub](../17-FORMS-FIELDS-CATALOG.md) |

---

## A. Order of work

1. Must every sale start with a **quotation**, or do you need **direct SI**?  
   → Try: `/app/sales/sales/new` vs quote-first `/app/quotation/quotations/new`
2. Is your warehouse **SO → Release → DR → Invoice**, or **invoice then deliver**?  
   → `/app/sales-order/sales-orders/release` · `/app/sales-order/delivery-receipts`
3. Prefer **combined pick** (stock out on release) or **reserve then deliver**?
4. Must **SO be Completed** before invoicing?
5. Is **PR mandatory** before PO? → `/app/purchase-request/purchase-requests/new`
6. **Receive then bill**, or **bill while receiving**? → `/app/purchases/purchase-receive/new`
7. Do you use **RFQ**? → `/app/purchase-order/rfq`

---

## B. Approvals & status

8. Who approves PR / SO / SI / Bill / Stock Adj / JE?
9. Is **e_approval** a real wait for you?
10. After reject, is **back to Unconfirmed** correct?

---

## C. Gates that feel wrong when they block

11. Which should **hard-block** vs stay advisory?  
    Quote→SO · SO→SI · DR→SI · PR→PO · GR→Bill · credit · JE approval · attachment-on-confirm  
    → Toggle live: `/app/user-management/process-policies`
12. Has **setup** blocked Buy/POS when you still wanted to demo? → `/app/setup`
13. Short stock: **block / warn / allow negative**?
14. Serial: always **count = qty**, or optional capture OK?

---

## D. Load Slip & attachments

15. Quote→SO Load Slip: what’s **missing** that you expected?  
    → `/app/sales-order/sales-orders/new` + [carry-over doc](13-LOAD-SLIP-CARRYOVER-AND-ATTACHMENTS.md)
16. SI←SO: is **copying attachments on Save** right or annoying?
17. Should **map-only** cross loads be hidden?
18. Official convert method: Load Slip, Generate slip, or Mapping Center?  
    → `/app/user-management/mapping-center`
19. Which docs **must** have a file: Quote, SO, SI, PO, Bill?
20. For Bill, is **DR + vendor SI** the right paperwork?

---

## E. Stock / money / POS / CRM

21. Stock Adjustment **Approve** — too heavy or correct? → `/app/inventory/stock-adjustments`
22. CoA / PH template close enough? → `/app/finance/acct-i/chart-of-accounts`
23. OR/PV **auto-post JE** — want on or off?
24. POS checkout = **completed SI + stock** — right? → `/app/pos`
25. Lead→Quote fields too strict? → `/app/crm/leads`

---

## F. Naming & #1 pain

26. Confusing labels: Bill vs Receive · Cash In vs OR · Pick list vs Release?
27. Which screen do people open **first** that isn’t “right”?
28. #1 weekly error toast — what should the product have done?  
    → [Submission errors](12-FORM-SUBMISSION-ERRORS.md)

---

## G. Close

29. Name **3 behaviors you’d change tomorrow**.  
30. Each one: **policy toggle**, **workflow redesign**, or **bug**?  
31. What must stay **strict for audit** even if ops complain?
