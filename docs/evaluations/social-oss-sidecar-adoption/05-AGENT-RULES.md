# Agentic design — safe pattern (written rules)

**Status:** Binding for any future sidecar experiment  
**Evidence note:** Aligns with LangChain social-media-agent HITL pattern and Postiz MCP reality (schedule tools exist; comment tools do not).

## Autonomy matrix

| Action | Agent may do alone? | Gate |
|--------|---------------------|------|
| Research / draft copy | **Yes** | Brand voice / FAQ allowlist |
| Plan calendar / suggest times | **Yes** | Human reviews plan |
| Upload media to library | **Yes** (ops sandbox) | Size/type caps |
| Create **draft** in Postiz | **Yes** | Prefer `draft` over `schedule`/`now` |
| **Schedule** or **publish** | **No** | Human approve in Postiz UI or explicit approve tool |
| Reply to **public comments** | **No** (capability mostly missing) | Human on network UI |
| Send **DM** / support reply | **No** (except FAQ allowlist) | Human in Chatwoot/OpenBSP; FAQ bot only if allowlisted |
| FAQ allowlist auto-reply | **Yes** | Frozen answer set; no free-form LLM send |
| Connect new OAuth channels | **No** | Human only |
| Rotate API keys | **No** | Human / secrets manager |

## Caps (defaults — tune per brand)

- Max drafts created per agent run: **10**
- Max publishes per human-approved batch: **20**
- Max DM auto-FAQ replies per hour: **30**
- Forbidden: paid ads spend, giveaways, legal/medical claims without human edit

## Kill switch

1. Revoke Postiz / Chatwoot / OpenBSP API keys in secrets store.
2. Disable MCP endpoint auth / rotate Bearer.
3. Pause Temporal/worker or scale to zero (self-host).
4. Disconnect channel integrations in Postiz UI.
5. Document incident; do not re-enable until human sign-off.

## Secrets

- Store tokens in existing secrets manager (not git, not User rules, not chat).
- Separate keys for **draft-capable** vs **publish-capable** agents if product allows; if not, treat all keys as publish-capable and keep agents draft-only via prompt + policy.
- No pasting platform passwords; OAuth only.

## Reject list (enforced)

- No browser/cookie session agents on brand accounts  
- No MiloAgent / LocoAgent / OpenTwins / linkedincli / auto-commenter against production  
- No “unofficial WhatsApp Web” for brand production (OpenBSP documents unofficial path — **reject** for brand)  
- No claiming comments inbox via agent  
- No Socioboard / &lt;1k★ scheduler as core agent backend  

## Reference pattern

LangChain `social-media-agent`: generate posts → **interrupt for human approve/edit** → then schedule. Replicate that interrupt even when Postiz MCP can call `schedulePostTool` directly.

## Acceptance (step 6)

- [x] Written agent rules  
- [x] Reject list enforced in rules  
