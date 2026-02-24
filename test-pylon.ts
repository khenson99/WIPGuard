async function test() {
  const query = new URLSearchParams({
    limit: "200",
    start_time: "2026-01-25T00:00:00.000Z",
    end_time: "2026-02-23T23:59:59.999Z",
  });
  const token = process.env.PYLON_API_KEY;
  console.log("Token:", token ? "Present" : "Missing");
  const url = `https://api.usepylon.com/issues?${query.toString()}`;
  console.log("Fetching:", url);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
  });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}
test().catch(console.error);
