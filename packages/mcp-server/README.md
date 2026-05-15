# hunt-mcp-server

Hunt protocol as a **Model Context Protocol (MCP) server** for Claude Desktop, Cursor, and any MCP-compatible client.

## What it does

Exposes Hunt's on-chain reads + the cryptographic strict-mode verifier as MCP tools, so an AI agent can query the Hunt protocol directly — list bounties, fetch findings, check per-CWE reputation, and cryptographically verify a winning finding against `teeSigner` without leaving its chat surface.

## Install (Claude Desktop)

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "hunt": {
      "command": "npx",
      "args": ["-y", "hunt-mcp-server"]
    }
  }
}
```

Restart Claude Desktop. The Hunt tools appear in the tools panel.

## Install (Cursor)

Add to `~/.cursor/mcp.json` (same shape). Cursor picks it up on restart.

## Local dev / direct run

```bash
git clone https://github.com/Ridwannurudeen/hunt
cd hunt/packages/mcp-server
npm install
node src/server.js                    # stdio server, talks JSON-RPC on stdin/stdout
```

Override the RPC or contract via env:

```bash
ZG_RPC_URL=https://evmrpc.0g.ai \
HUNT_ADDRESS=0xD4Fe5127d519B775a9a581A54ED0719BBFf0d68C \
node src/server.js
```

## Tools

| Tool | What it returns |
|---|---|
| `hunt_stats` | totalHunters, totalBounties, status breakdown, cumulative OG paid, teeSigner, verifier, current block |
| `hunt_list_hunters` | all minted hunters with specialty, wins, submissions, total earned |
| `hunt_get_hunter` | full hunter detail by id |
| `hunt_list_bounties` | all bounties with status (Open/Settled/Expired) + findings count |
| `hunt_get_bounty` | single bounty detail + findings count |
| `hunt_get_findings` | every finding for a bounty (attestation digest, signature, self-eval) |
| `hunt_get_class_rep` | per-CWE ClassRep for (hunterId, cweClass). Accepts bytes32 or kebab-case CWE name |
| `hunt_verify_bounty` | **the strict-mode cryptographic verifier** — recovers signer, re-derives digest, checks race window. Pass `modelDigest` for strict mode |
| `hunt_canonical_digest` | computes `keccak256(utf8("zai-org/GLM-5-FP8\|hunt-audit-v1"))` for use with `hunt_verify_bounty` |
| `hunt_list_cwes` | the 12 canonical CWE classes Hunt hunters specialise in, with their bytes32 hashes |

## Example sessions

**"What's Hunt's per-CWE reputation for hunter #1 on oracle-manipulation?"**
→ agent calls `hunt_get_class_rep` with `hunterId: 1, cweClass: "oracle-manipulation"` → returns `wins: 8, submissions: 8, totalEarnedOG: 0.4` (live mainnet).

**"Cryptographically verify bounty #3's winning finding."**
→ agent calls `hunt_canonical_digest` → gets `0xba2eccd8…03078e` → calls `hunt_verify_bounty` with `bountyId: 3, modelDigest: 0xba2eccd8…03078e` → returns `pass: true` with signer match, race-window check, and digest re-derivation confirmed.

## Architecture notes

- **Read-only.** No transaction signing. The protocol's state-changing entry points (`postBounty`, `mintHunter`, `expireBounty`, `settleBounty`) require a wallet — that's the browser surface at `hunt.gudman.xyz`.
- **Stdio transport.** No HTTP, no auth, no tokens — uses stdin/stdout JSON-RPC per MCP spec. Diagnostics go to stderr (never stdout — would corrupt the protocol stream).
- **No mocks.** Every read goes against the deployed Hunt contract on 0G Aristotle mainnet (chain 16661). The `cumulativePaidOG` number you see is the same on-chain number a judge gets running `scripts/verify_bounty.js`.
- **Source of truth.** `contracts/Hunt.sol` (in the parent repo). The ABI baked into this package is a minimal subset of the full Hunt ABI; for the full ABI use `deployments/Hunt.json` in the parent repo.

## License

MIT. See parent repo for full license + project context.
