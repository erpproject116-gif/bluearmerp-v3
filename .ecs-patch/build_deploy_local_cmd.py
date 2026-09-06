from pathlib import Path
import base64

b64patch = Path(__file__).with_name("cb5407d.patch.gz.b64").read_text(encoding="utf-8").strip()

shell = f"""set -eu
echo {b64patch} | base64 -d | gzip -d > /tmp/cb5407d.patch
cd /root/bluearmerp-v3
git status -sb
git log -1 --oneline
git apply --check /tmp/cb5407d.patch
git apply /tmp/cb5407d.patch
date -u +%Y%m%d%H%M%S > api/.rebuild-bust
git status -sb -- api/internal/modules/inventory/serial_reports.go
CONTAINER_NAME=bluearm-api
ENV_FILE=/tmp/bluearm-api.env
docker inspect "$CONTAINER_NAME" --format '{{{{range .Config.Env}}}}{{{{println .}}}}{{{{end}}}}' > "$ENV_FILE"
cd api
docker build -t bluearm-api:latest .
docker stop "$CONTAINER_NAME" 2>/dev/null || true
docker rm "$CONTAINER_NAME" 2>/dev/null || true
docker run -d --name "$CONTAINER_NAME" --restart unless-stopped --env-file "$ENV_FILE" -p 8080:8080 bluearm-api:latest
health_code=000
i=0
while [ "$i" -lt 30 ]; do
  health_code=$(curl -sS -o /dev/null -w '%{{http_code}}' http://127.0.0.1:8080/health 2>/dev/null || echo 000)
  if [ "$health_code" = "200" ]; then
    break
  fi
  i=$((i + 1))
  sleep 2
done
echo HEALTH_CODE=$health_code
curl -sf http://127.0.0.1:8080/health/schema || true
echo
grep -E 'opening_qty|include_transfers|slip_type' /root/bluearmerp-v3/api/internal/modules/inventory/serial_reports.go | head -20
echo DEPLOY_LOCAL_PATCH_DONE
"""

enc = base64.b64encode(shell.encode("utf-8")).decode("ascii")
cli = (
    "aliyun ecs RunCommand --region ap-southeast-1 --RegionId ap-southeast-1 "
    "--Type RunShellScript --Timeout 900 --ContentEncoding Base64 "
    "--InstanceId.1 i-t4n5tdhzaktd0x6tc34w "
    f"--CommandContent {enc} "
    "--Name inv-book-p1-apply-docker-only"
)
out = Path(__file__).with_name("cli_deploy_local.txt")
out.write_text(cli, encoding="utf-8")
print("cli_len", len(cli), "shell_len", len(shell))
