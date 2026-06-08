# WIPGuard-app heap-leak capture runbook

Goal: capture a V8 heap snapshot from the **live, leaking** `WIPGuard-app`
process so we can identify the exact object that grows to ~4 GB and OOMs
(~10 min cadence). Run these from your machine (Railway CLI logged in, `ssh`
available). Nothing here changes prod config or code.

The plan: take **two** snapshots a few minutes apart from the running process
via the V8 inspector, then diff them — the constructor whose retained size
keeps growing is the leak.

---

## 0. Link (skip if already linked)
```bash
railway link        # pick: WIPGuard  ->  production  ->  WIPGuard-app
```

## 1. Get a fresh ~10-min window and open a shell in the container
```bash
railway redeploy --service WIPGuard-app -y
sleep 75                                   # let it boot + finish migrations
railway ssh --service WIPGuard-app
```

## 2. Inside the container: open the inspector on the server process
```bash
PID=$(pgrep -f next-server | head -1); echo "server pid=$PID"
grep VmRSS /proc/$PID/status               # note the baseline RSS
kill -USR1 "$PID"                          # opens V8 inspector on 127.0.0.1:9229
```

## 3. Inside the container: drop in a tiny snapshot helper
`ws` ships with the app (socket.io depends on it), so this needs no installs.
```bash
cat > /tmp/snap.js <<'EOF'
const http=require('http'), fs=require('fs');
const WS=require('/app/node_modules/ws');
const out=process.argv[2]||'/tmp/app.heapsnapshot';
http.get('http://127.0.0.1:9229/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{
  const u=JSON.parse(d)[0].webSocketDebuggerUrl;
  const ws=new WS(u), f=fs.createWriteStream(out);
  ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'HeapProfiler.takeHeapSnapshot',params:{reportProgress:false}})));
  ws.on('message',m=>{const o=JSON.parse(m);
    if(o.method==='HeapProfiler.addHeapSnapshotChunk') f.write(o.params.chunk);
    if(o.id===1) f.end(()=>{console.log('wrote',out,fs.statSync(out).size,'bytes');ws.close();process.exit(0);});});
});}).on('error',e=>{console.error('inspector not reachable — did kill -USR1 run?',e.message);process.exit(1);});
EOF
cd /app
```

## 4. Take snapshot #1, wait ~3 min, take snapshot #2
```bash
node /tmp/snap.js /tmp/snap1.heapsnapshot
sleep 180
grep VmRSS /proc/$PID/status               # RSS should be visibly higher now
node /tmp/snap.js /tmp/snap2.heapsnapshot
gzip -f /tmp/snap1.heapsnapshot /tmp/snap2.heapsnapshot
ls -la /tmp/snap*.gz
exit                                        # leave the container shell
```

## 5. Copy both snapshots to your machine
```bash
railway ssh --service WIPGuard-app "cat /tmp/snap1.heapsnapshot.gz" > snap1.heapsnapshot.gz
railway ssh --service WIPGuard-app "cat /tmp/snap2.heapsnapshot.gz" > snap2.heapsnapshot.gz
gunzip -f snap1.heapsnapshot.gz snap2.heapsnapshot.gz
ls -la snap1.heapsnapshot snap2.heapsnapshot
```

## 6. Hand them back
Either:
- **Send me `snap1.heapsnapshot` + `snap2.heapsnapshot`** (commit to a branch, or
  attach), and I'll identify the leaking allocation and write the fix; or
- **Self-serve in Chrome:** open `chrome://inspect` → DevTools → **Memory** →
  **Load** snap1, then snap2 → select snap2 → mode **Comparison** (vs snap1) →
  sort by **Size Delta** / **# New**. The constructor at the top with a large
  positive delta is the leak — tell me what it is and I'll fix it.

---

### Notes / fallback
- If `require('/app/node_modules/ws')` errors (path differs), run
  `find / -maxdepth 6 -type d -name ws -path '*node_modules*' 2>/dev/null` and
  use that path.
- Snapshots are roughly the size of live heap; taking them a few minutes in
  (a few hundred MB) keeps files movable. gzip shrinks them ~5–10×.
- Fallback (auto-dump at OOM, needs a volume): add a Railway volume mounted at
  `/app/snapshots`, set `NODE_OPTIONS=--heapsnapshot-near-heap-limit=2`, change
  the start command to `cd /app/snapshots && node /app/server.js`, redeploy; the
  next OOM writes a `.heapsnapshot` to the volume. The inspector method above is
  simpler and is preferred.
