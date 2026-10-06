# Fashion Studio — SLOs, alerts and runbooks

Window: rolling 30 days. Signals come from `/api/health` (polled every minute by an uptime checker),
Vercel function logs and the `runs` table.

| SLI | Measured as | SLO | Error budget (30 d) |
| --- | --- | --- | --- |
| Availability | `/api/health` returns 200 | 99.5% | ~3.6 h |
| Generation success | succeeded ÷ (succeeded + failed) runs, excluding content-policy refusals | 97% | 3% of runs |
| Queue latency | time from `queued` → `running` | p95 < 30 s | 5% of runs over |
| Image tool latency | `running` → `succeeded`, image tools | p95 < 90 s | 5% of runs over |
| Video tool latency | `running` → `succeeded`, 360 tools | p95 < 6 min | 5% of runs over |
| Asset integrity | uploads whose stored sha256 ≠ uploaded bytes | 0 | none — page immediately |

Why these numbers: generations are paid with credits and failed runs are refunded automatically,
so a 3% failure budget costs users time, not money. Model providers (fal, OpenRouter) are the main
failure source; each tool already falls through to a second provider.

## Alerts

| Alert | Condition | Severity |
| --- | --- | --- |
| Site down | `/api/health` non-200 for 3 consecutive minutes | page |
| Queue stuck | `problem: "queue_stuck"` (oldest queued run > 10 min) | page |
| Fast burn | `runs1h.errorRate` > 0.15 for 10 min | page |
| Slow burn | `runs1h.errorRate` > 0.05 for 2 h | ticket |
| Provider locked | logs contain `User is locked` (fal top-up needed) | ticket |
| Abuse | > 50 `"event":"rate_limited"` log lines in 10 min | ticket |

## Runbooks

**Queue stuck.** Check the Railway worker (`/health` on the worker service). If it is down, redeploy it;
queued runs are picked up automatically (`claimNext` uses `FOR UPDATE SKIP LOCKED`). Runs stuck in
`running` are retried once by `recoverStale` and then refunded.

**High failure rate.** Group failures: `select error, count(*) from runs where status='failed' and finished_at > now() - interval '1 hour' group by 1 order by 2 desc;`
- `provider is temporarily unavailable` → fal/OpenRouter balance or outage. Top up fal (dashboard → billing);
  image tools keep working through OpenRouter, video tools need fal.
- `The model declined` → content policy, not an incident.
- Storage errors → check R2 credentials (`S3_*`) on both Vercel and Railway.

**Provider locked (fal `TOP_UP`).** Top up the fal account. The engine marks fal down for 5 minutes and
retries automatically; nothing to restart.

**Integrity alert.** Never expected — uploads are stored without modification and chunked uploads are
sha256-verified before being registered. Pull the affected asset ids from logs, compare `meta.sha256`
against the object in R2, and check whether anything rewrote objects under `S3_PREFIX`.

## Error budget policy

If a 30-day budget is exhausted: pause feature releases, spend the next cycle on the top failure
cause from the query above, and write a blameless postmortem (what happened, impact, timeline,
root cause, follow-ups with owners).
