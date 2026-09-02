#!/usr/bin/env node
/**
 * ECS production verification (no Render dependency).
 * Run: node scripts/verify-ecs-production.mjs
 */
const ECS = "https://api.bluearmerp.com";
const APP = "https://app.bluearmerp.com";

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(30_000) });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

function ok(label, pass, detail = "") {
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${label}${detail ? ` — ${detail}` : ""}`);
  return pass;
}

async function main() {
  console.log("=== ECS production verification ===\n");
  let allPass = true;

  const ecsHealth = await fetchJson(`${ECS}/health`);
  allPass = ok("ECS /health", ecsHealth.status === 200, `HTTP ${ecsHealth.status}`) && allPass;

  const ecsSchema = await fetchJson(`${ECS}/health/schema`);
  const ecsMigration = ecsSchema.body?.data?.latest_migration ?? "?";
  allPass =
    ok("ECS /health/schema healthy", ecsSchema.body?.data?.healthy === true, ecsMigration) && allPass;
  allPass =
    ok(
      "ECS pending migrations",
      ecsSchema.body?.data?.pending_count === 0,
      String(ecsSchema.body?.data?.pending_count ?? "?"),
    ) && allPass;

  const ecsCors = await fetch(`${ECS}/api/v1/auth/me`, {
    method: "OPTIONS",
    headers: {
      Origin: APP,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const allowOrigin = ecsCors.headers.get("access-control-allow-origin") ?? "";
  allPass =
    ok(
      "ECS CORS allows app.bluearmerp.com",
      allowOrigin === APP || allowOrigin === "*",
      allowOrigin || "missing header",
    ) && allPass;

  const appHtml = await fetch(APP, { signal: AbortSignal.timeout(30_000) }).then((r) => r.text());
  const jsMatch = appHtml.match(/\/assets\/index-[^"]+\.js/);
  let apiHost = "";
  if (jsMatch) {
    const js = await fetch(`${APP}${jsMatch[0]}`, { signal: AbortSignal.timeout(60_000) }).then(
      (r) => r.text(),
    );
    if (js.includes("api.bluearmerp.com")) apiHost = "api.bluearmerp.com";
    else if (js.includes("onrender.com")) apiHost = "onrender.com";
  }
  allPass =
    ok(
      "Vercel production bundle uses ECS API",
      apiHost === "api.bluearmerp.com",
      apiHost || "could not detect",
    ) && allPass;

  const articles = await fetch(`${APP}/articles`, { signal: AbortSignal.timeout(30_000) });
  allPass = ok("CMS /articles on app host", articles.status === 200, `HTTP ${articles.status}`) && allPass;

  const cmsApi = await fetchJson(`${ECS}/api/v1/public/cms/pages?page=1&pageSize=1`);
  allPass = ok("ECS public CMS API", cmsApi.status === 200, `HTTP ${cmsApi.status}`) && allPass;

  const mfg = await fetchJson(
    `${ECS}/api/v1/manufacturing/reports/work-order-status?page=1&pageSize=1`,
  );
  allPass =
    ok(
      "Manufacturing reports route on ECS",
      mfg.status === 401 || mfg.status === 200,
      `HTTP ${mfg.status} (401 = route exists)`,
    ) && allPass;

  console.log(`\n=== ${allPass ? "ECS production checks PASSED" : "Some checks FAILED"} ===`);
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
