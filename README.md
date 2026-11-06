# DBMon collector sizing

Enter a number of database receivers, get the minimum vCPU and memory for the Splunk OTel
Collector, plus the smallest AWS and Azure instances that satisfy it.

Single static page, no build step, no dependencies.

```
index.html    markup and styles
sizing.js     sizing model, instance catalogues, rendering
verify.mjs    headless checks (node verify.mjs)
```

## The model

```
peak CPU (millicores) = 9.42 × N + 709
peak RSS (MiB)        = 8.09 × N + 746
```

Marginal cost per receiver is **9.4 mc and 8.1 MiB**. Fixed cost with the event pipeline active
is **~709 mc and ~746 MiB**. The page applies a headroom multiplier (1.5× by default) to the peak
before matching instances.

## Where the numbers come from

Two validated benchmark runs, 23/23 validity checks each, on a `c5.2xlarge` collector host:

| Receivers | Peak CPU | Peak RSS |
| --- | --- | --- |
| 50 | 1,180 mc | 1,151 MiB |
| 200 | 2,593 mc | 2,364 MiB |

Measured with **Splunk OTel Collector 0.161.0** against AWS RDS **Oracle SE2 19c**, HammerDB
**TPROC-C at 20 warehouses**, with `db.server.query_sample` and `db.server.top_query` both
enabled. Peak is a 2-second instantaneous maximum.

A third run at 1 receiver (40 mc / 261 MiB peak) is deliberately excluded from the fit: it used a
4 vCPU host and barely exercises the event pipeline, so it does not sit on the same line.

## Limitations

- **Two data points.** A straight line through two points cannot be distinguished from a curve.
- **Valid between 50 and 200 receivers.** Below 50 the large fixed term makes the model
  over-state what you need; above 200 is untested extrapolation. The page says so when you leave
  the range.
- **Oracle only.** The database selector offers SQL Server, PostgreSQL and MySQL because the
  question gets asked, but none of them has been benchmarked this way. Selecting one reuses the
  Oracle model as a rough proxy and the page says so prominently. Per-receiver cost depends on
  what each receiver's queries ask of its database, and that differs substantially between
  engines. To add a measured engine, give it its own coefficients in the `ENGINES` table in
  `sizing.js`.
- **Both events enabled.** With `query_sample` and `top_query` off, cost is far lower — the event
  pipeline accounts for most of it.
- **Instance order is a cost proxy**, not a price lookup: fewest vCPU, then least memory. Confirm
  current pricing and regional availability.

Set `SPLUNK_MEMORY_TOTAL_MIB` above the reported peak memory. The memory limiter refuses
telemetry before the host is exhausted, so a host sized tight on memory drops data rather than
slowing down.

## Verifying

```bash
node verify.mjs
```

Checks that the model reproduces both measured runs exactly, that the shortlist never returns an
instance too small on either dimension, that the validity notices fire outside the fitted range,
and that the rendered figures match the model.

## Hosting on GitHub Pages

```bash
git init && git add -A && git commit -m "DBMon collector sizing calculator"
gh repo create dbmon-receiver-sizing --public --source=. --push
gh api -X POST repos/:owner/dbmon-receiver-sizing/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

Served at `https://<owner>.github.io/dbmon-receiver-sizing/`. Because it is a single static page
with no dependencies, it also works opened straight from disk, or from any object store or
internal web host. Use a private repo if the measurements should not be public.
