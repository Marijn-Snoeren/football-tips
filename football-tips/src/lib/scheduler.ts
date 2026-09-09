import cron from "node-cron";

let isInitialized = false;

export function initScheduler() {
  if (isInitialized) return;
  isInitialized = true;

  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
        const host = process.env.VERCEL_URL || "localhost:3000";
        await fetch(`${protocol}://${host}/api/cron/tips`);
        console.log("[Scheduler] Successfully executed midnight tips update.");
      } catch (err) {
        console.error("[Scheduler] Error running background update:", err);
      }
    },
    {
      timezone: "Europe/Amsterdam",
    }
  );
}