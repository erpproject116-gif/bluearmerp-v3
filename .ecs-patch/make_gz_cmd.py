from pathlib import Path

b64 = Path(".ecs-patch/cb5407d.patch.gz.b64").read_text(encoding="ascii").strip()
inner = (
    "set -euo pipefail; "
    f"echo {b64} | base64 -d | gzip -d > /tmp/cb5407d.patch; "
    "wc -c /tmp/cb5407d.patch; "
    "cd /root/bluearmerp-v3; "
    "git apply --check /tmp/cb5407d.patch; "
    "git apply /tmp/cb5407d.patch; "
    "git add api/internal/modules/inventory/serial_reports.go "
    "api/internal/modules/inventory/serial_reports_test.go "
    "web/src/modules/inventory/reports/InvBookReportPage.tsx "
    "web/src/modules/inventory/reports/StockLedgerReportPage.tsx "
    "web/src/modules/inventory/serial-lot/SerialBookReportPage.tsx "
    "web/src/shared/useSerialReports.ts; "
    "git -c user.name=erpproject-gif -c user.email=erpproject116@gmail.com "
    "commit -m 'Upgrade Serial Inv. Book to slip-ledger parity and deep-link Inv. Book to Stock Ledger.'; "
    "git push origin main; "
    "git log -1 --oneline; "
    "bash /root/bluearmerp-v3/deploy/alibaba/deploy-api-on-ecs.sh"
)
Path(".ecs-patch/command_gz.txt").write_text(inner, encoding="utf-8")
print(len(inner))
