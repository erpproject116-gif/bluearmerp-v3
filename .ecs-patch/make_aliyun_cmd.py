from pathlib import Path

b64 = Path(".ecs-patch/cb5407d.b64").read_text(encoding="ascii").strip()
inner = (
    "set -euo pipefail; "
    f"echo {b64} | base64 -d > /tmp/cb5407d.patch; "
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
escaped = inner.replace("\\", "\\\\").replace('"', '\\"')
cmd = (
    "aliyun ecs RunCommand --region ap-southeast-1 --RegionId ap-southeast-1 "
    "--Type RunShellScript --Timeout 900 --InstanceId.1 i-t4n5tdhzaktd0x6tc34w "
    f'--CommandContent "{escaped}"'
)
Path(".ecs-patch/aliyun_cmd.txt").write_text(cmd, encoding="utf-8")
Path(".ecs-patch/command_content_only.txt").write_text(inner, encoding="utf-8")
print(len(cmd), len(inner))
