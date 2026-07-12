# Cloudflare Workers

| Package | Worker name | Status | Dataset / role |
|---------|-------------|--------|----------------|
| [`scores-api`](scores-api/) | `vernan-scores` | Live | D1 scores + crashes; emits to api-ops + security |
| [`auth-api`](auth-api/) | `vernan-auth` | Live | Auth KV; emits to api-ops + security |
| [`metrics-api`](metrics-api/) | `vernan-metrics` | Live | `vernan_metrics` — product/gameplay |
| [`client-health-api`](client-health-api/) | `vernan-client-health` | Live | `vernan_client_health` — boot / assets / perf |
| [`api-ops-api`](api-ops-api/) | `vernan-api-ops` | Live | `vernan_api_ops` — request latency/status |
| [`security-api`](security-api/) | `vernan-security` | Live | `vernan_security` — rate limits / auth failures |

## Deploy

Deploy ingest workers first, then scores/auth (service bindings):

```bash
cd workers/client-health-api && npm run deploy
cd ../api-ops-api && npm run deploy
cd ../security-api && npm run deploy
cd ../metrics-api && npm run deploy
cd ../scores-api && npm run deploy
cd ../auth-api && npm run deploy
```

## Event cheat sheet

- **metrics:** `run_start`, `floor_reached`, `run_death`, `run_retry`, `run_restart`, `score_submit`, `auth`
- **client-health:** `boot_timing`, `asset_load_fail`, `perf_signal`
- **api-ops:** `api_request` (`service`, `route`, `method`, `status`, `latency_ms`)
- **security:** `rate_limit_hit`, `auth_failure` (`reason_code` only — no passwords/tokens/usernames)
