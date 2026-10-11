// Run as a separate worker or scheduler after deploying the web app.
const url = process.env.INDEXER_URL;
const secret = process.env.CRON_SECRET;
if (!url || !secret || !/^https?:\/\//.test(url)) {
  throw new Error("Set INDEXER_URL and CRON_SECRET for the polling worker");
}
const interval = Number(process.env.INDEXER_INTERVAL_MS || 15_000);
if (!Number.isInteger(interval) || interval < 5_000) throw new Error("INDEXER_INTERVAL_MS must be at least 5000");
while (true) {
  try {
    const response = await fetch(url, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Indexer returned ${response.status}`);
    console.log(new Date().toISOString(), JSON.stringify(result));
  } catch (error) {
    console.error(new Date().toISOString(), error);
  }
  await new Promise(resolve => setTimeout(resolve, interval));
}
