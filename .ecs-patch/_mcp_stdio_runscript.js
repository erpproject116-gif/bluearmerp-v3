const fs = require("fs");
const Module = require("module");

const SDK_ROOT =
  "C:/home/gaben/.npm-global/node_modules/firebase-tools/node_modules";
module.paths.unshift(SDK_ROOT);
Module.globalPaths.unshift(SDK_ROOT);

const ARGS_PATH =
  "C:/Users/John Ranel/.cursor/projects/c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github/agent-tools/EXACT_ARGS.json";
const OUT_PATH =
  "C:/Users/John Ranel/.cursor/projects/c-Users-John-Ranel-Documents-BluearmERP-bluearmerp-v3-github/agent-tools/mcp_stdio_result.json";
const MCP_URL =
  "https://openapi-mcp.ap-southeast-1.aliyuncs.com/id/GC6rQufakqkwOHuj/mcp";

async function main() {
  const args = JSON.parse(fs.readFileSync(ARGS_PATH, "utf8"));
  console.log("script_len", args.script.length);

  const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
  const {
    StdioClientTransport,
  } = require("@modelcontextprotocol/sdk/client/stdio.js");

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "mcp-remote-alibaba-cloud", MCP_URL],
    stderr: "pipe",
  });

  const client = new Client({ name: "exact-runscript", version: "1.0.0" });
  console.log("connecting...");
  await client.connect(transport);
  console.log("connected");

  const result = await client.callTool({
    name: "AlibabaCloud___RunScript",
    arguments: { script: args.script },
  });
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), "utf8");
  console.log("wrote", OUT_PATH);
  console.log(JSON.stringify(result).slice(0, 3000));
  await client.close();
}

main().catch((e) => {
  console.error("FAIL", e && e.stack ? e.stack : e);
  process.exit(1);
});
