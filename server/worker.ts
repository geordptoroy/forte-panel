import { processDomainEventsOnce, processQueuedMessagesOnce, recoverProcessingDomainEvents, recoverProcessingMessages } from "./db";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 1500);
const batchSize = Number(process.env.WORKER_BATCH_SIZE ?? 10);
const maxAttempts = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);
const eventBatchSize = Number(process.env.EVENT_WORKER_BATCH_SIZE ?? batchSize);
const eventMaxAttempts = Number(process.env.EVENT_WORKER_MAX_ATTEMPTS ?? 5);
let stopping = false;

async function tick() {
  try {
    const result = await processQueuedMessagesOnce(batchSize, maxAttempts);
    if (result.processed > 0) {
      console.log(`[forte-worker] processadas=${result.processed} enviadas=${result.sent} falhas=${result.failed}`);
    }
    const events = await processDomainEventsOnce(eventBatchSize, eventMaxAttempts);
    if (events.processed > 0) {
      console.log(`[forte-worker] eventos=${events.processed} entregues=${events.delivered} falhas=${events.failed}`);
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
