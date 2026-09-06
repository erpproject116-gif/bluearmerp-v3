from pathlib import Path
import base64

shell = r"""set -eu
cd /root/bluearmerp-v3
git log -1 --oneline
docker inspect bluearm-api --format '{{range .Config.Env}}{{println .}}{{end}}' > /tmp/bluearm-api.env 2>/dev/null || true
docker stop bluearm-api 2>/dev/null || true
docker rm -f bluearm-api 2>/dev/null || true
docker run -d --name bluearm-api --restart unless-stopped --env-file /tmp/bluearm-api.env -p 8080:8080 bluearm-api:latest
health_code=000
i=0
while [ "$i" -lt 30 ]; do
  health_code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:8080/health 2>/dev/null || echo 000)
  if [ "$health_code" = "200" ]; then
    break
  fi
  i=$((i + 1))
  sleep 2
done
echo HEALTH_CODE=$health_code
curl -sf http://127.0.0.1:8080/health/schema || true
echo
curl -sf https://api.bluearmerp.com/health/schema || true
echo
docker ps --filter name=bluearm-api --format '{{.ID}} {{.Image}} {{.Status}}'
echo CONTAINER_RESTART_DONE
"""

enc = base64.b64encode(shell.encode("utf-8")).decode("ascii")
cli = (
    "aliyun ecs RunCommand --region ap-southeast-1 --RegionId ap-southeast-1 "
    "--Type RunShellScript --Timeout 180 --ContentEncoding Base64 "
    "--InstanceId.1 i-t4n5tdhzaktd0x6tc34w "
    f"--CommandContent {enc} "
    "--Name ecs-container-restart"
)
Path(__file__).with_name("cli_restart.txt").write_text(cli, encoding="utf-8")
print("cli_len", len(cli))
