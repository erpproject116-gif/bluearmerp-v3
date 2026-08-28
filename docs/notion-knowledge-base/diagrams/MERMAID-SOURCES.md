# Diagrams (Mermaid source)

Notion does not render Mermaid. Export PNG from [mermaid.live](https://mermaid.live) and embed, or keep as code for developers.

## 1. Company big picture

```mermaid
flowchart TD
  A[Sign in] --> B[Setup wizard foundation]
  B --> C{Foundation complete?}
  C -->|No| B
  C -->|Yes| D[Masters: people places products]
  D --> E[Turn on modules and policies]
  E --> F[Sell path]
  E --> G[Buy path]
  F --> H[Collect money]
  G --> I[Pay suppliers]
  H --> J[Books and reports]
  I --> J
  E --> K[Optional POS]
  E --> L[Optional CRM after-sales HR projects]
  J --> M[Dashboard alerts]
```

## 2. Sell spine

```mermaid
flowchart LR
  Q[Quotation] --> SO[Sales Order]
  SO --> R[Release / Pick]
  R --> DR[Delivery note]
  R --> SI[Sales invoice]
  DR --> SI
  SI --> CI[Combined invoice]
  SI --> OR[Official receipt]
```

## 3. Buy spine

```mermaid
flowchart LR
  PR[Purchase request] --> AP[Approve]
  AP --> RFQ[RFQ]
  RFQ --> PO[Purchase order]
  PR --> PO
  PO --> GR[Goods receipt]
  GR --> BILL[Supplier invoice]
  BILL --> PV[Payment voucher]
```

## 4. Release mode fork

```mermaid
flowchart TD
  REL[SO Release]
  REL --> P{legacy_combined_so_release?}
  P -->|true default| OH[Lower on-hand]
  P -->|false| RSV[Raise reserved]
  RSV --> DR[Delivery note post]
  DR --> OH2[Lower on-hand and reserved]
  OH --> SI1[SI checks released minus invoiced]
  OH2 --> SI2[SI checks delivered minus invoiced]
```
