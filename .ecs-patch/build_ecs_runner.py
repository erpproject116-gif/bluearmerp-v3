from pathlib import Path

b64 = Path(".ecs-patch/cb5407d.b64").read_text(encoding="ascii").strip()
# Escape for embedding inside single-quoted heredoc is not needed; use base64 file write via python -c on ECS with stdin from echo chunks.
# Instead write a compact runner that decodes from /tmp/cb5407d.b64 uploaded separately.

runner = r"""#!/bin/bash
set -euo pipefail
cd /root/bluearmerp-v3
python3 -c "import base64; open('/tmp/cb5407d.patch','wb').write(base64.b64decode(open('/tmp/cb5407d.b64').read()))"
wc -c /tmp/cb5407d.patch
git status -sb
git apply --check /tmp/cb5407d.patch
git apply /tmp/cb5407d.patch
git add \
  api/internal/modules/inventory/serial_reports.go \
  api/internal/modules/inventory/serial_reports_test.go \
  web/src/modules/inventory/reports/InvBookReportPage.tsx \
  web/src/modules/inventory/reports/StockLedgerReportPage.tsx \
  web/src/modules/inventory/serial-lot/SerialBookReportPage.tsx \
  web/src/shared/useSerialReports.ts
git -c user.name=erpproject-gif -c user.email=erpproject116@gmail.com commit -m "Upgrade Serial Inv. Book to slip-ledger parity and deep-link Inv. Book to Stock Ledger."
git push origin main
git log -1 --oneline
bash /root/bluearmerp-v3/deploy/alibaba/deploy-api-on-ecs.sh
"""
Path(".ecs-patch/ecs_apply_push.sh").write_text(runner, encoding="utf-8")
print("runner_ok", len(runner), "b64", len(b64))
