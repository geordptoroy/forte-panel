import {
  cleanupOnboardingAudioRetention,
  cleanupOperationalRetention,
  cleanupWorkspaceUsageBuckets,
  processDailySummaryNotificationsOnce,
  processDomainEventsOnce,
  processQueuedMessagesOnce,
  processWorkspaceQuotaAlertsOnce,
  recoverProcessingDomainEvents,
  recoverProcessingMessages,
} from "./db";
import { recordWorkerHeartbeat } from "./platform-admin";
import { logWorkspaceAction } from "./workspace";
import { runStorageReconciliationSweep } from "./storage-reconciliation-runner";
import { emitOperationalEvent } from "./_core/observability";
import { processKnowledgeIngestionOnce } from "./knowledge-ingestion-worker";

const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 1500);
const batchSize = Number(process.env.WORKER_BATCH_SIZE ?? 10);
const maxAttempts = Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);
const eventBatchSize = Number(process.env.EVENT_WORKER_BATCH_SIZE ?? batchSize);
const eventMaxAttempts = Number(process.env.EVENT_WORKER_MAX_ATTEMPTS ?? 5);
const heartbeatMs = Math.max(
  10_000,
  Number(process.env.WORKER_HEARTBEAT_MS ?? 60_000)
);
let stopping = false;
let nextDailySummarySweepAt = 0;
let nextQuotaAlertSweepAt = 0;
let nextUsageCleanupAt = 0;
let nextOnboardingAudioCleanupAt = 0;
let nextOperationalRetentionAt = 0;
let nextMediaReconciliationAt = 0;
let nextHeartbeatAt = 0;
let nextKnowledgeIngestionAt = 0;
let tickCount = 0;
let lastError: string | null = null;
let wakeup: (() => void) | undefined;
async function tick() {
  try {
    tickCount += 1;
    const result = await processQueuedMessagesOnce(batchSize, maxAttempts);
    if (result.processed > 0 || result.throttled > 0) {
      console.log(
        `[forte-worker] processadas=${result.processed} enviadas=${result.sent} falhas=${result.failed} limitadas=${result.throttled}`
      );
    }
    const events = await processDomainEventsOnce(
      eventBatchSize,
      eventMaxAttempts
    );
    if (events.processed > 0) {
      console.log(
        `[forte-worker] eventos=${events.processed} entregues=${events.delivered} falhas=${events.failed}`
      );
    }
    if (Date.now() >= nextKnowledgeIngestionAt) {
      nextKnowledgeIngestionAt = Date.now() + Math.max(5_000, Number(process.env.KNOWLEDGE_INGESTION_INTERVAL_MS ?? 15_000));
      const ingestion = await processKnowledgeIngestionOnce(Number(process.env.KNOWLEDGE_INGESTION_BATCH ?? 2));
      if (ingestion.claimed > 0)
        console.log(`[forte-worker] rag_ingestao=${ingestion.claimed} indexados=${ingestion.indexed} falhas=${ingestion.failed}`);
    }
    if (Date.now() >= nextDailySummarySweepAt) {
      nextDailySummarySweepAt = Date.now() + 60_000;
      const summaries = await processDailySummaryNotificationsOnce();
      if (summaries.processed > 0)
        console.log(`[forte-worker] resumosDiarios=${summaries.processed}`);
    }
    if (Date.now() >= nextQuotaAlertSweepAt) {
      nextQuotaAlertSweepAt = Date.now() + 60_000;
      const quotaAlerts = await processWorkspaceQuotaAlertsOnce();
      if (quotaAlerts.processed > 0)
        console.log(`[forte-worker] alertasCota=${quotaAlerts.processed}`);
    }
    if (Date.now() >= nextUsageCleanupAt) {
      nextUsageCleanupAt = Date.now() + 24 * 60 * 60_000;
      const cleanup = await cleanupWorkspaceUsageBuckets();
      if (cleanup.workspaceBuckets > 0 || cleanup.userBuckets > 0) {
        console.log(
          `[forte-worker] bucketsRemovidos workspace=${cleanup.workspaceBuckets} usuarios=${cleanup.userBuckets}`
        );
      }
    }
    if (Date.now() >= nextOnboardingAudioCleanupAt) {
      const sweepIntervalMs = Math.max(
        60_000,
        Number(
          process.env.FORTE_ONBOARDING_RETENTION_SWEEP_MS ?? 24 * 60 * 60_000
        )
      );
      nextOnboardingAudioCleanupAt = Date.now() + sweepIntervalMs;
      const cleanup = await cleanupOnboardingAudioRetention({
        dryRun: process.env.FORTE_ONBOARDING_RETENTION_DRY_RUN === "true",
      });
      for (const [workspaceId, counts] of Object.entries(cleanup.workspaces)) {
        if (counts.assets === 0 && counts.transcriptions === 0) continue;
        await logWorkspaceAction({
          workspaceId: Number(workspaceId),
          action: cleanup.dryRun
            ? "onboarding_audio_retention_dry_run"
            : "onboarding_audio_retention_cleanup",
          summary: `${cleanup.dryRun ? "Dry-run" : "Limpeza"} de retenção: ${counts.assets} assets brutos e ${counts.transcriptions} transcrições derivadas`,
        });
      }
      if (cleanup.assetsExpired > 0 || cleanup.transcriptionsExpired > 0) {
        console.log(
          `[forte-worker] onboardingAudioRetencao=${cleanup.dryRun ? "dry-run" : "aplicada"} assets=${cleanup.assetsExpired} transcricoes=${cleanup.transcriptionsExpired}`
        );
      }
    }
    if (Date.now() >= nextOperationalRetentionAt) {
      const sweepIntervalMs = Math.max(
        60_000,
        Number(
          process.env.FORTE_OPERATIONAL_RETENTION_SWEEP_MS ?? 24 * 60 * 60_000
        )
      );
      nextOperationalRetentionAt = Date.now() + sweepIntervalMs;
      const cleanup = await cleanupOperationalRetention({
        dryRun: process.env.FORTE_OPERATIONAL_RETENTION_DRY_RUN !== "false",
        limit: Number(process.env.FORTE_OPERATIONAL_RETENTION_BATCH ?? 1_000),
      });
      for (const [workspaceId, counts] of Object.entries(cleanup.workspaces)) {
        if (counts.webhookEvents === 0 && counts.domainEvents === 0) continue;
        await logWorkspaceAction({
          workspaceId: Number(workspaceId),
          action: cleanup.dryRun
            ? "operational_retention_dry_run"
            : "operational_retention_cleanup",
          summary: `${cleanup.dryRun ? "Dry-run" : "Limpeza"} operacional: ${counts.webhookEvents} webhooks e ${counts.domainEvents} eventos de domínio`,
        });
      }
      if (
        cleanup.webhookEvents ||
        cleanup.domainEvents ||
        cleanup.securityRateLimitBuckets
      ) {
        console.log(
          `[forte-worker] retencaoOperacional=${cleanup.dryRun ? "dry-run" : "aplicada"} webhooks=${cleanup.webhookEvents} eventos=${cleanup.domainEvents} buckets=${cleanup.securityRateLimitBuckets}`
        );
      }
    }
    if (Date.now() >= nextMediaReconciliationAt) {
      const sweepIntervalMs = Math.max(
        60_000,
        Number(
          process.env.FORTE_MEDIA_RECONCILIATION_SWEEP_MS ?? 24 * 60 * 60_000
        )
      );
      nextMediaReconciliationAt = Date.now() + sweepIntervalMs;
      const reconciliation = await runStorageReconciliationSweep({
        // A provider real só será injetada quando o storage oferecer list/delete
        // paginado; ausência explícita mantém a operação em no-op seguro.
        dryRun: process.env.FORTE_MEDIA_RECONCILIATION_DRY_RUN !== "false",
        workspaceLimit: Number(
          process.env.FORTE_MEDIA_RECONCILIATION_WORKSPACE_LIMIT ?? 100
        ),
        maxPages: Number(
          process.env.FORTE_MEDIA_RECONCILIATION_MAX_PAGES ?? 1000
        ),
      });
      if (
        !reconciliation.skipped &&
        (reconciliation.candidates ||
          reconciliation.deleted ||
          reconciliation.failures)
      ) {
        console.log(
          `[forte-worker] mediaReconcilacao=${reconciliation.dryRun ? "dry-run" : "aplicada"} workspaces=${reconciliation.workspaces} candidates=${reconciliation.candidates} deleted=${reconciliation.deleted} failures=${reconciliation.failures}`
        );
      }
    }
    if (Date.now() >= nextHeartbeatAt) {
      nextHeartbeatAt = Date.now() + heartbeatMs;
      await recordWorkerHeartbeat({
        service: "forte-panel-worker",
        ticks: tickCount,
        intervalMs,
        lastError,
      });
      console.log(
        JSON.stringify({
          event: "worker_heartbeat",
          service: "forte-panel-worker",
          ticks: tickCount,
          intervalMs,
          lastError,
          timestamp: new Date().toISOString(),
        })
      );
      void emitOperationalEvent({
        event: "worker_heartbeat",
        severity: lastError ? "warning" : "info",
        service: "forte-panel-worker",
        data: { ticks: tickCount, intervalMs, lastError },
      });
      lastError = null;
    }
  } catch (error) {
    lastError = error instanceof Error ? error.name : "unknown_error";
    console.error("[forte-worker] erro no ciclo", error);
    void emitOperationalEvent({
      event: "worker_tick_failed",
      severity: "critical",
      service: "forte-panel-worker",
      data: { error: lastError },
    });
  }
}

async function main() {
  const recovered = await recoverProcessingMessages();
  const recoveredEvents = await recoverProcessingDomainEvents();
  console.log(
    `[forte-worker] iniciado; intervalo=${intervalMs}ms lote=${batchSize} tentativas=${maxAttempts} eventosLote=${eventBatchSize} eventosTentativas=${eventMaxAttempts} recuperadas=${recovered} eventosRecuperados=${recoveredEvents}`
  );
  while (!stopping) {
    await tick();
    if (stopping) break;
    await new Promise<void>(resolve => {
      const timer = setTimeout(resolve, intervalMs);
      wakeup = () => {
        clearTimeout(timer);
        resolve();
      };
    });
    wakeup = undefined;
  }
  console.log("[forte-worker] shutdown gracioso concluído");
}

const stop = () => {
  stopping = true;
  wakeup?.();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

void main().catch(error => {
  console.error("[forte-worker] falha fatal", error);
  process.exitCode = 1;
});
