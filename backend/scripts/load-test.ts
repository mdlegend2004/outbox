/**
 * Schedules N emails (default 1000) for the same instant through the public API,
 * then prints how the scheduler spreads them out.
 *
 *   npm run load-test -- 1000 20
 *                      count ^  ^ campaign hourly limit
 *
 * Recipients use the reserved example.com domain; Ethereal never delivers
 * externally, so this is safe to run.
 */
const API = process.env.API_URL ?? "http://localhost:4000";
const count = Number(process.argv[2] ?? 1000);
const hourlyLimit = Number(process.argv[3] ?? 20);

async function main() {
  const login = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "loadtest@example.com", password: "loadtest-password" }),
  });
  if (!login.ok) throw new Error(`login failed: ${await login.text()}`);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  const headers = { "Content-Type": "application/json", Cookie: cookie };

  const { senders } = await (await fetch(`${API}/api/senders`, { headers })).json();
  const recipients = Array.from({ length: count }, (_, i) => `lead${i}@example.com`);

  const t0 = Date.now();
  const res = await fetch(`${API}/api/campaigns`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      senderId: senders[0].id,
      subject: `Load test ${new Date().toISOString()}`,
      body: "<p>Load test</p>",
      recipients,
      delaySeconds: 0, // all due at the same moment
      hourlyLimit,
    }),
  });
  console.log(`POST /api/campaigns → ${res.status} in ${Date.now() - t0} ms`, await res.json());
  console.log(`
Expected behaviour:
  • all ${count} jobs are delayed jobs in Redis (see /admin/queues)
  • the BullMQ limiter starts at most 1 send per MIN_DELAY_BETWEEN_SENDS_MS across all workers
  • after ${hourlyLimit} sends this hour, remaining jobs are moved (in order) to the next hour window
  • a Slack alert fires once when the limit is reached (if Slack is connected)
Watch it: GET ${API}/api/emails?tab=scheduled  or the dashboard.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
