#!/usr/bin/env bash
# Run INSIDE the WIPGuard-app container. Drives authenticated /api/analytics
# load to trigger the leak, watches RSS climb, and writes a heap snapshot once
# the heap has clearly grown (well before OOM, so the file stays uploadable).
set -uo pipefail
cd /app 2>/dev/null || true
PORT="${PORT:-8080}"
THRESH_KB=350000            # snapshot once RSS passes ~350 MB
echo "== host=$(hostname) port=$PORT =="

# 1) a real user with an org
ROW=$(psql "$DATABASE_URL" -t -A -F'|' -c "select id, email, coalesce(\"organizationId\",'') from \"User\" where \"organizationId\" is not null order by \"createdAt\" asc limit 1;" 2>&1 | head -1)
UID_="${ROW%%|*}"; REST="${ROW#*|}"; EMAIL="${REST%%|*}"
echo "user_id=${UID_:0:8}... email_present=$([ -n "$EMAIL" ] && echo yes || echo no)"
[ -z "$UID_" ] && { echo "FATAL: no user / db error: $ROW"; exit 2; }

# 2) mint a NextAuth session JWE with the app's own encoder
TOKEN=$(node -e '
const run=async()=>{try{
  const {encode}=require("/app/node_modules/next-auth/jwt");
  const t=await encode({token:{id:process.argv[1],sub:process.argv[1],email:process.argv[2],name:"leak-probe"},secret:process.env.NEXTAUTH_SECRET,maxAge:3600});
  process.stdout.write(t);
}catch(e){console.error("ENCODE_ERR",e.message);process.exit(3);}};run();' "$UID_" "$EMAIL" 2>/tmp/enc.err)
[ -z "$TOKEN" ] && { echo "FATAL token mint failed: $(cat /tmp/enc.err)"; exit 3; }
echo "token_len=${#TOKEN}"
CK=(-b "__Secure-next-auth.session-token=$TOKEN" -b "next-auth.session-token=$TOKEN")

# 3) server pid + open inspector + auth probe
PID=$(pgrep -f next-server | head -1); [ -z "$PID" ] && PID=$(pgrep -f server.js | head -1)
rss(){ awk '/VmRSS/{print $2}' /proc/$1/status 2>/dev/null; }
BASE=$(rss $PID); echo "server_pid=$PID  baseline_rss=${BASE}kB"
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "${CK[@]}" "http://127.0.0.1:$PORT/api/analytics")
echo "auth probe /api/analytics -> $CODE  (200=authed; if 401 the token was rejected, stop here)"
kill -USR1 "$PID"; sleep 1   # open V8 inspector on 127.0.0.1:9229

# 4) drive authenticated load until heap clearly grows (or max rounds)
echo "== driving authenticated load (what a polling dashboard tab does) =="
HIT=0
for round in $(seq 1 80); do
  for j in $(seq 1 6); do
    curl -s -o /dev/null --max-time 45 "${CK[@]}" "http://127.0.0.1:$PORT/api/analytics" &
    curl -s -o /dev/null --max-time 45 "${CK[@]}" "http://127.0.0.1:$PORT/api/analytics?refresh=true" &
  done
  wait
  R=$(rss $PID); echo "round $round  rss=${R}kB"
  if [ "${R:-0}" -gt "$THRESH_KB" ]; then HIT=1; echo ">> heap grew past ${THRESH_KB}kB after $round rounds"; break; fi
done
echo "FINAL rss=$(rss $PID)kB  (baseline ${BASE}kB)"
[ "$HIT" = 0 ] && echo "NOTE: heap did not grow much - capturing anyway; tell Claude the round-by-round RSS above."

# 5) snapshot the (grown) process via the inspector
cat > /tmp/snap.js <<'EOF'
const http=require('http'),fs=require('fs');const WS=require('/app/node_modules/ws');
http.get('http://127.0.0.1:9229/json/list',r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>{
  const u=JSON.parse(d)[0].webSocketDebuggerUrl;const ws=new WS(u),f=fs.createWriteStream('/tmp/leak.heapsnapshot');
  ws.on('open',()=>ws.send(JSON.stringify({id:1,method:'HeapProfiler.takeHeapSnapshot',params:{reportProgress:false}})));
  ws.on('message',m=>{const o=JSON.parse(m);
    if(o.method==='HeapProfiler.addHeapSnapshotChunk')f.write(o.params.chunk);
    if(o.id===1)f.end(()=>{console.log('wrote /tmp/leak.heapsnapshot',fs.statSync('/tmp/leak.heapsnapshot').size,'bytes');ws.close();process.exit(0);});});
});}).on('error',e=>{console.error('inspector not reachable:',e.message);process.exit(1);});
EOF
node /tmp/snap.js
gzip -f /tmp/leak.heapsnapshot
ls -la /tmp/leak.heapsnapshot.gz
echo "== DONE. Copy it out from your machine:"
echo "   railway ssh --service WIPGuard-app \"cat /tmp/leak.heapsnapshot.gz\" > leak.heapsnapshot.gz"
