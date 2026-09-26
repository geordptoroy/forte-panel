import { cleanupWorkspaceUsageBuckets, processDailySummaryNotificationsOnce, processDomainEventsOnce, processQueuedMessagesOnce, processWorkspaceQuotaAlertsOnce, recoverProcessingDomainEvents, recoverProcessingMessages } from "./db";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 1500);
const batchSize = Number(process.env.WORKER_BATCH_SIZE ?? 10);
const maxAttempts = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);
const eventBatchSize = Number(process.env.EVENT_WORKER_BATCH_SIZE ?? batchSize);
const eventMaxAttempts = Number(process.env.EVENT_WORKER_MAX_ATTEMPTS ?? 5);
let stopping = false;
let nextDailySummarySweepAt = 0;
let nextQuotaAlertSweepAt = 0;
let nextUsageCleanupAt = 0;

async function tick() {
  try {
    const result = await processQueuedMessagesOnce(batchSize, maxAttempts);
    if (result.processed > 0 || result.throttled > 0) {
      console.log(`[forte-worker] processadas=${result.processed} enviadas=${result.sent} falhas=${result.failed} limitadas=${result.throttled}`);
    }
    const events = await processDomainEventsOnce(eventBatchSize, eventMaxAttempts);
    if (events.processed > 0) {
      console.log(`[forte-worker] eventos=${events.processed} entregues=${events.delivered} falhas=${events.failed}`);
    }
    if (Date.now() >= nextDailySummarySweepAt) {
      nextDailySummarySweepAt = Date.now() + 60_000;
      const summaries = await processDailySummaryNotificationsOnce();
      if (summaries.processed > 0) console.log(`[forte-worker] resumosDiarios=${summaries.processed}`);
    }
    if (Date.now() >= nextQuotaAlertSweepAt) {
      nextQuotaAlertSweepAt = Date.now() + 60_000;
      const quotaAlerts = await processWorkspaceQuotaAlertsOnce();
      if (quotaAlerts.processed > 0) console.log(`[forte-worker] alertasCota=${quotaAlerts.processed}`);
    }
    if (Date.now() >= nextUsageCleanupAt) {
      nextUsageCleanupAt = Date.now() + 24 * 60 * 60_000;
      const cleanup = await cleanupWorkspaceUsageBuckets();
      if (cleanup.workspaceBuckets > 0 || cleanup.userBuckets > 0) {
        console.log(`[forte-worker] bucketsRemovidos workspace=${cleanup.workspaceBuckets} usuarios=${cleanup.userBuckets}`);
      }
    }
  } catch (error) {
    console.error("[forte-worker] erro no ciclo", error);
  }
}

async function main() {
  const recovered = await recoverProcessingMessages();
  const recoveredEvents = await recoverProcessingDomainEvents();
  console.log(`[forte-worker] iniciado; intervalo=${intervalMs}ms lote=${batchSize} tentativas=${maxAttempts} eventosLote=${eventBatchSize} eventosTentativas=${eventMaxAttempts} recuperadas=${recovered} eventosRecuperados=${recoveredEvents}`);
  while (!stopping) {
    await tick();
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

const stop = () => { stopping = true; };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

void main();
