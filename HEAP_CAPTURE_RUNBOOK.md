# WIPGuard-app heap-leak capture runbook (v2 — drives the load itself)

`snap1`/`snap2` came back as identical ~48 MB baselines: the heap never grew
because nothing drove **authenticated** dashboard load during the window (this
app is flat at idle and only leaks on authenticated `/api/analytics` requests).

`capture-leak.sh` fixes that: inside the container it mints a real session,
hammers `/api/analytics`, watches RSS climb, and snapshots once the heap has
clearly grown — then you copy the snapshot out and send it to Claude.

## Run it (from your machine, in your WIPGuard clone)

```bash
git checkout claude/wipguard-bug-vZt1r && git pull   # gets capture-leak.sh

# fresh instance + ~10-min window
railway redeploy --service WIPGuard-app -y
sleep 75

# ship the script into the container and run it (one shot, no interactive paste)
B64=$(base64 < capture-leak.sh | tr -d '\n')
railway ssh --service WIPGuard-app "echo $B64 | base64 -d > /tmp/cap.sh && bash /tmp/cap.sh"
```

Watch the `round N  rss=…kB` lines — RSS should climb fast. It stops and writes
`/tmp/leak.heapsnapshot.gz` once RSS passes ~350 MB.

## Copy it out and hand it back

```bash
railway ssh --service WIPGuard-app "cat /tmp/leak.heapsnapshot.gz" > leak.heapsnapshot.gz
```

Then **upload `leak.heapsnapshot.gz` in this chat** (zip it if the client only
takes .zip). Also paste the `round … rss=` lines — even before I open the file,
the growth curve tells me how fast each request leaks.

### If `auth probe -> 401`
The token was rejected (cookie name / secret mismatch). Tell me and I'll adjust
the mint — but it should be 200.

### If RSS does NOT climb
Then the leak isn't on `/api/analytics` and I need to widen the probe to other
authenticated dashboard endpoints — paste the round-by-round RSS and I'll
iterate on which endpoint to hit.
