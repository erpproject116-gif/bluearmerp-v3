import fs from "node:fs";

const p = "e2e/.auth/chunks-full.json";
if (!fs.existsSync(p)) {
  console.error("missing", p);
  process.exit(2);
}
const chunks = JSON.parse(fs.readFileSync(p, "utf8"));
const json = Buffer.from(chunks.join(""), "base64").toString("utf8");
const state = JSON.parse(json);
for (const o of state.origins || []) {
  for (const item of o.localStorage || []) {
    if (String(item.name || "").includes("auth-token")) {
      try {
        const sess = JSON.parse(item.value);
        delete sess.provider_token;
        delete sess.provider_refresh_token;
        item.value = JSON.stringify(sess);
      } catch {
        /* keep */
      }
    }
  }
}
fs.mkdirSync("e2e/.auth", { recursive: true });
fs.writeFileSync("e2e/.auth/user.json", JSON.stringify(state));
fs.unlinkSync(p);
console.log(
  JSON.stringify({
    ok: true,
    keys: state.origins[0].localStorage.map((x) => x.name),
    authLen: state.origins[0].localStorage.find((x) => String(x.name).includes("auth"))?.value
      .length,
  }),
);
