# Gate discipline (mandatory)

**Never** claim module or product “complete”, “almost identical”, or “nothing missed” unless the cited gates pass with numbers from [`scorecard.md`](scorecard.md).

| Claim allowed | Requires |
|---------------|----------|
| G0 closed | `python scripts/reconcile-sitemap-coverage.py --check` exits 0 |
| Module depth known | All target module rows `status=depth-complete` |
| Module ops parity | Target P0/P1 rows `bluearm_parity` in {parity, partial+residual list, deferred+reason} — zero silent `missing` |
| Shell IA (G4) | Top strip Inv.I/II Acct.I/II left trees cover catalog leaves (live or deferred stub) |
| Product Ecount-class | All licensed modules G0–G3 + G6/G7 |

Violations of this language rule are treated as documentation bugs.
