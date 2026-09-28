import { useCallback, useEffect, useState } from "react";
import {
  getCountries,
  getCountryCallingCode,
  isPossiblePhoneNumber,
  type CountryCode,
} from "libphonenumber-js";
import {
  CheckCircle2,
  Gauge,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import PanelLayout, { EmptyState, StatusBadge } from "@/components/PanelLayout";
import { baileysStatusPollingInterval } from "@/lib/baileys-status";
import { trpc } from "@/lib/trpc";

const countryDisplayNames = new Intl.DisplayNames(["pt-BR"], {
  type: "region",
});
const countryFlag = (country: string) =>
  /^[A-Z]{2}$/.test(country)
    ? String.fromCodePoint(
        ...country.split("").map(character => 127397 + character.charCodeAt(0))
      )
    : "🌐";
const phoneCountryOptions = getCountries()
  .map(country => ({
    country,
    name: countryDisplayNames.of(country) ?? country,
    callingCode: getCountryCallingCode(country),
    flag: countryFlag(country),
  }))
  .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));

const connectionStatusDetails: Record<
  string,
  { label: string; tone: "green" | "amber" | "red" | "neutral"; detail: string }
> = {
  unconfigured: {
    label: "Gateway não configurado",
    tone: "red",
    detail: "O serviço Baileys ainda não está disponível para este ambiente.",
  },
  idle: {
    label: "Aguardando conexão",
    tone: "neutral",
    detail: "Escolha QR Code ou código por telefone para começar.",
  },
  connecting: {
    label: "Conectando",
    tone: "amber",
    detail: "O WhatsApp está finalizando o handshake da sessão.",
  },
  pairing: {
    label: "Aguardando pareamento",
    tone: "amber",
    detail: "Conclua a confirmação no aplicativo WhatsApp.",
  },
  qr: {
    label: "QR disponível",
    tone: "amber",
    detail: "Leia o QR Code em Aparelhos conectados.",
  },
  connected: {
    label: "Conectado",
    tone: "green",
    detail: "Sessão ativa. O status acompanha a conexão automaticamente.",
  },
  disconnected: {
    label: "Desconectado",
    tone: "neutral",
    detail: "A sessão não está ativa. Você pode conectar novamente.",
  },
  logged_out: {
    label: "Sessão encerrada",
    tone: "amber",
    detail: "O WhatsApp encerrou a sessão; será necessário parear novamente.",
  },
  error: {
    label: "Erro na conexão",
    tone: "red",
    detail: "Confira o erro informado pelo gateway e tente novamente.",
  },
};

export function WhatsappConnectionPage() {
  return (
    <PanelLayout
      eyebrow="Core · Baileys"
      title="Instâncias WhatsApp"
      description="Gerencie as conexões deste workspace. O status é atualizado automaticamente, inclusive enquanto você confirma o pareamento no celular."
    >
      <BaileysConnectionManager />
    </PanelLayout>
  );
}

function BaileysConnectionManager() {
  const utils = trpc.useUtils();
  const [name, setName] = useState("WhatsApp comercial");
  const [instanceStatuses, setInstanceStatuses] = useState<
    Record<string, string>
  >({});
  const instances = trpc.workspace.baileysInstances.useQuery(undefined, {
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
  const create = trpc.workspace.createBaileysInstance.useMutation({
    onSuccess: async () => {
      setName("");
      await utils.workspace.baileysInstances.invalidate();
    },
  });
  const instanceIds = (instances.data ?? [])
    .map(instance => instance.instanceId)
    .join("|");

  useEffect(() => {
    const validIds = new Set(instanceIds ? instanceIds.split("|") : []);
    setInstanceStatuses(current => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => validIds.has(id))
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [instanceIds]);

  const reportStatus = useCallback((instanceId: string, status?: string) => {
    setInstanceStatuses(current => {
      if (!status) {
        if (!(instanceId in current)) return current;
        const next = { ...current };
        delete next[instanceId];
        return next;
      }
      if (current[instanceId] === status) return current;
      return { ...current, [instanceId]: status };
    });
  }, []);

  const total = instances.data?.length;
  const statusesReady =
    total !== undefined && Object.keys(instanceStatuses).length >= total;
  const connectedCount = Object.values(instanceStatuses).filter(
    status => status === "connected"
  ).length;
  const pendingCount = Object.values(instanceStatuses).filter(status =>
    ["connecting", "pairing", "qr"].includes(status)
  ).length;

  return (
    <div className="whatsapp-page-stack">
      <section
        className="whatsapp-summary-grid"
        aria-label="Resumo das conexões WhatsApp"
      >
        <article className="surface whatsapp-summary-card">
          <span>Instâncias</span>
          <strong>{total === undefined ? "—" : total}</strong>
          <small>Vinculadas a este workspace</small>
        </article>
        <article className="surface whatsapp-summary-card is-connected">
          <span>Conectadas</span>
          <strong>{statusesReady ? connectedCount : "—"}</strong>
          <small>Sessões ativas no WhatsApp</small>
        </article>
        <article className="surface whatsapp-summary-card is-pending">
          <span>Em configuração</span>
          <strong>{statusesReady ? pendingCount : "—"}</strong>
          <small>QR, pareamento ou handshake</small>
        </article>
      </section>

      <section
        className="surface whatsapp-create-card"
        aria-labelledby="new-instance-title"
      >
        <div className="whatsapp-create-heading">
          <div className="whatsapp-create-icon">
            <Plus size={18} />
          </div>
          <div>
            <span className="eyebrow">Comece por aqui</span>
            <h2 id="new-instance-title">Nova instância</h2>
            <p>
              Crie uma sessão Baileys para este workspace. Você poderá renomear
              ou excluir depois.
            </p>
          </div>
        </div>
        <form
          className="whatsapp-create-form"
          onSubmit={event => {
            event.preventDefault();
            if (name.trim().length >= 2) create.mutate({ name: name.trim() });
          }}
        >
          <label className="form-field" htmlFor="new-whatsapp-instance-name">
            <span>Nome da conexão</span>
            <input
              id="new-whatsapp-instance-name"
              className="input-control"
              value={name}
              maxLength={120}
              onChange={event => setName(event.target.value)}
              placeholder="Ex.: WhatsApp comercial"
            />
          </label>
          <button
            className="btn-primary"
            type="submit"
            disabled={create.isPending || name.trim().length < 2}
          >
            <Plus size={15} />{" "}
            {create.isPending ? "Criando instância..." : "Criar instância"}
          </button>
        </form>
        {create.error && (
          <div className="form-error" role="alert">
            {create.error.message}
          </div>
        )}
      </section>

      <section
        className="whatsapp-instances-section"
        aria-labelledby="instance-list-title"
      >
        <div className="whatsapp-list-heading">
          <div>
            <span className="eyebrow">Sessões do workspace</span>
            <h2 id="instance-list-title">Suas instâncias</h2>
            <p>
              QR Code e código por telefone são duas formas de parear a mesma
              sessão.
            </p>
          </div>
          <div className="whatsapp-list-tools">
            {total !== undefined && (
              <StatusBadge tone="neutral">
                {total} {total === 1 ? "instância" : "instâncias"}
              </StatusBadge>
            )}
            <button
              type="button"
              className="btn-secondary whatsapp-refresh-list"
              disabled={instances.isFetching}
              onClick={() => void instances.refetch()}
              aria-label="Atualizar lista de instâncias"
            >
              <RefreshCw
                size={14}
                className={instances.isFetching ? "spin" : undefined}
              />
              Atualizar
            </button>
          </div>
        </div>

        {instances.isLoading ? (
          <div className="surface whatsapp-empty-panel" role="status">
            Carregando instâncias do workspace...
          </div>
        ) : instances.error ? (
          <div className="form-error" role="alert">
            {instances.error.message}
          </div>
        ) : instances.data?.length ? (
          <div className="whatsapp-instance-list">
            {instances.data.map(instance => (
              <BaileysInstanceCard
                key={instance.instanceId}
                instanceId={instance.instanceId}
                name={instance.name}
                onStatusUpdate={reportStatus}
              />
            ))}
          </div>
        ) : (
          <div className="surface whatsapp-empty-panel">
            <EmptyState
              icon={QrCode}
              title="Nenhuma instância criada"
              description="Crie sua primeira instância para iniciar a conexão com um número do WhatsApp."
            />
          </div>
        )}
      </section>
    </div>
  );
}

function BaileysInstanceCard({
  instanceId,
  name,
  onStatusUpdate,
}: {
  instanceId: string;
  name: string;
  onStatusUpdate: (instanceId: string, status?: string) => void;
}) {
  const utils = trpc.useUtils();
  const [nameDraft, setNameDraft] = useState(name);
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>("BR");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const status = trpc.workspace.baileysStatus.useQuery(
    { instanceId },
    {
      refetchInterval: query =>
        baileysStatusPollingInterval(query.state.data?.status),
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: "always",
      refetchOnReconnect: "always",
      retry: false,
    }
  );
  const current = status.data;
  const stateKey = current?.status ?? "idle";
  const stateDetails = connectionStatusDetails[stateKey] ?? {
    label: stateKey,
    tone: "neutral" as const,
    detail: "O gateway está consultando o estado desta sessão.",
  };
  const connected = current?.status === "connected";
  const waitingQr = current?.status === "qr";
  const localPhoneDigits = phone.replace(/\D/g, "");
  const fullPhone = `+${getCountryCallingCode(countryCode)}${localPhoneDigits}`;
  const phoneIsPossible = isPossiblePhoneNumber(fullPhone);
  const qr = trpc.workspace.baileysQr.useQuery(
    { instanceId },
    {
      enabled: waitingQr,
      refetchInterval: 3_000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: "always",
      retry: false,
    }
  );
  const refresh = async () => {
    await Promise.all([
      status.refetch(),
      utils.workspace.baileysQr.invalidate({ instanceId }),
      utils.workspace.baileysInstances.invalidate(),
    ]);
  };
  const connect = trpc.workspace.connectBaileys.useMutation({
    onSuccess: refresh,
  });
  const rename = trpc.workspace.renameBaileysInstance.useMutation({
    onSuccess: async () => {
      await utils.workspace.baileysInstances.invalidate();
    },
  });
  const disconnect = trpc.workspace.disconnectBaileys.useMutation({
    onSuccess: refresh,
  });
  const pairing = trpc.workspace.requestBaileysPairingCode.useMutation({
    onSuccess: async result => {
      setPairingCode(result.code);
      await refresh();
    },
  });
  const remove = trpc.workspace.deleteBaileysInstance.useMutation({
    onSuccess: async () => {
      setConfirmDelete(false);
      await utils.workspace.baileysInstances.invalidate();
    },
  });

  useEffect(() => {
    onStatusUpdate(instanceId, status.error ? undefined : current?.status);
  }, [current?.status, instanceId, onStatusUpdate, status.error]);

  useEffect(() => {
    if (
      ["connected", "disconnected", "logged_out", "error"].includes(
        current?.status ?? ""
      )
    )
      setPairingCode(null);
  }, [current?.status]);

  const badge = status.error
    ? { label: "Gateway indisponível", tone: "red" as const }
    : status.isLoading
      ? { label: "Consultando gateway...", tone: "neutral" as const }
      : { label: stateDetails.label, tone: stateDetails.tone };

  return (
    <article
      className={`surface whatsapp-instance-card ${connected ? "is-connected" : ""}`}
      aria-label={`Instância ${name}`}
    >
      <header className="whatsapp-instance-header">
        <div
          className={`whatsapp-instance-mark ${connected ? "is-online" : ""}`}
        >
          {connected ? <Wifi size={18} /> : <WifiOff size={18} />}
        </div>
        <div className="whatsapp-instance-identity">
          <div className="whatsapp-instance-overline">
            SESSÃO BAILEYS <code>{instanceId}</code>
          </div>
          <h3>{name}</h3>
          <p>
            {current?.phoneNumber
              ? `Número conectado: ${current.phoneNumber}`
              : stateDetails.detail}
          </p>
        </div>
        <div className="whatsapp-instance-status">
          <div aria-live="polite">
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          </div>
          <button
            type="button"
            className="btn-ghost whatsapp-refresh-status"
            disabled={status.isFetching}
            onClick={() => void refresh()}
            title="Atualizar estado desta instância"
          >
            <RefreshCw
              size={13}
              className={status.isFetching ? "spin" : undefined}
            />
            Atualizar status
          </button>
        </div>
      </header>

      {status.error && (
        <div className="form-error whatsapp-instance-error" role="alert">
          {status.error.message}
        </div>
      )}
      {current?.lastError && (
        <div className="form-error whatsapp-instance-error" role="alert">
          {current.lastError}
        </div>
      )}

      <div className="whatsapp-rename-form">
        <label className="form-field" htmlFor={`instance-name-${instanceId}`}>
          <span>Nome da instância</span>
          <input
            id={`instance-name-${instanceId}`}
            className="input-control"
            value={nameDraft}
            maxLength={120}
            onChange={event => setNameDraft(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-secondary"
          disabled={
            rename.isPending ||
            nameDraft.trim().length < 2 ||
            nameDraft.trim() === name
          }
          onClick={() => rename.mutate({ instanceId, name: nameDraft.trim() })}
        >
          {rename.isPending ? "Salvando..." : "Salvar nome"}
        </button>
      </div>
      {rename.error && (
        <div className="form-error whatsapp-instance-error" role="alert">
          {rename.error.message}
        </div>
      )}

      {connected ? (
        <section
          className="whatsapp-connected-panel"
          aria-label="Controles da sessão conectada"
        >
          <div className="whatsapp-connected-copy">
            <CheckCircle2 size={18} />
            <div>
              <strong>WhatsApp conectado</strong>
              <span>A sessão está ativa no gateway Baileys.</span>
            </div>
          </div>
          <div className="whatsapp-session-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate({ instanceId, logout: false })}
            >
              Desconectar temporariamente
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={disconnect.isPending}
              onClick={() => disconnect.mutate({ instanceId, logout: true })}
            >
              Encerrar sessão
            </button>
          </div>
        </section>
      ) : (
        <div className="whatsapp-method-grid">
          <section
            className="whatsapp-method-card"
            aria-labelledby={`qr-method-${instanceId}`}
          >
            <div className="whatsapp-method-heading">
              <span className="whatsapp-method-number">01</span>
              <div>
                <span className="eyebrow">Conexão recomendada</span>
                <h4 id={`qr-method-${instanceId}`}>Conectar com QR Code</h4>
                <p>
                  Leia o código pela opção Aparelhos conectados no WhatsApp.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={
                connect.isPending ||
                !current?.configured ||
                current?.status === "pairing"
              }
              onClick={() => connect.mutate({ instanceId })}
            >
              <QrCode size={15} />
              {connect.isPending
                ? "Preparando QR Code..."
                : current?.status === "pairing"
                  ? "Pareamento por telefone em andamento"
                  : waitingQr
                    ? "Atualizar QR Code"
                    : "Gerar QR Code"}
            </button>
            {waitingQr && (
              <div
                className="whatsapp-qr-panel"
                aria-live="polite"
                aria-label={`QR Code de ${name}`}
              >
                {qr.data ? (
                  <img src={qr.data} alt={`QR Code para conectar ${name}`} />
                ) : (
                  <span>
                    <QrCode size={28} /> Carregando QR Code...
                  </span>
                )}
              </div>
            )}
            {qr.error && (
              <small className="qr-error">
                QR temporariamente indisponível. Atualize a conexão para tentar
                novamente.
              </small>
            )}
            {(connect.error || disconnect.error) && (
              <div className="form-error" role="alert">
                {connect.error?.message ?? disconnect.error?.message}
              </div>
            )}
          </section>

          <section
            className="whatsapp-method-card whatsapp-phone-method"
            aria-labelledby={`phone-method-${instanceId}`}
          >
            <div className="whatsapp-method-heading">
              <span className="whatsapp-method-number">02</span>
              <div>
                <span className="eyebrow">Alternativa ao QR</span>
                <h4 id={`phone-method-${instanceId}`}>Conectar com número</h4>
                <p>
                  Solicite um código para vincular este aparelho ao WhatsApp.
                </p>
              </div>
            </div>
            <details className="whatsapp-pairing-details">
              <summary>Informar número e gerar código</summary>
              <div className="phone-entry-group">
                <label className="form-field">
                  <span>País e DDI</span>
                  <select
                    className="input-control"
                    value={countryCode}
                    aria-label="País e código DDI"
                    onChange={event =>
                      setCountryCode(event.target.value as CountryCode)
                    }
                  >
                    {phoneCountryOptions.map(option => (
                      <option key={option.country} value={option.country}>
                        {option.flag} {option.name} (+{option.callingCode})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Número nacional</span>
                  <input
                    className="input-control"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={event => setPhone(event.target.value)}
                    placeholder="DDD e telefone"
                    aria-label="Número nacional incluindo DDD ou código de área"
                  />
                </label>
              </div>
              <small className="muted phone-number-hint">
                Inclua DDD/código de área e digite o número sem o DDI; o país
                selecionado acrescenta o DDI automaticamente.
              </small>
              <button
                type="button"
                className="btn-secondary"
                disabled={
                  pairing.isPending || !phoneIsPossible || !current?.configured
                }
                onClick={() => {
                  setPairingCode(null);
                  pairing.reset();
                  pairing.mutate({ instanceId, phone: fullPhone });
                }}
              >
                {pairing.isPending
                  ? "Aguardando confirmação do WhatsApp..."
                  : "Gerar código de pareamento"}
              </button>
              {pairingCode && (
                <div className="whatsapp-pairing-result" aria-live="polite">
                  <span className="eyebrow">Código aceito pelo WhatsApp</span>
                  <div className="pairing-code">{pairingCode}</div>
                  <small>
                    No celular: Configurações → Aparelhos conectados → Conectar
                    aparelho → Conectar com número de telefone. Digite
                    exatamente os 8 caracteres; podem incluir letras.
                  </small>
                </div>
              )}
              {pairing.error && (
                <div className="form-error" role="alert">
                  {pairing.error.message}
                </div>
              )}
            </details>
          </section>
        </div>
      )}

      <footer className="whatsapp-instance-footer">
        <span>
          O estado acompanha o gateway em segundo plano; nenhuma atualização
          manual é necessária.
        </span>
        <button
          type="button"
          className="btn-ghost whatsapp-delete-button"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={14} /> Excluir instância
        </button>
      </footer>

      {confirmDelete && (
        <div
          className="connection-wizard-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`delete-${instanceId}`}
        >
          <div className="connection-wizard">
            <h2 id={`delete-${instanceId}`}>Excluir “{name}”?</h2>
            <p className="muted">
              A sessão desta instância será encerrada e removida do gateway. O
              histórico de mensagens do workspace não será apagado. Para voltar
              a usar este número, será necessário criar e parear uma nova
              instância.
            </p>
            <div className="qr-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmDelete(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate({ instanceId, confirmDeletion: true })
                }
              >
                {remove.isPending ? "Excluindo..." : "Confirmar exclusão"}
              </button>
            </div>
            {remove.error && (
              <div
                className="form-error"
                role="alert"
                style={{ marginTop: 12 }}
              >
                {remove.error.message}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}

export function WorkspaceUsagePage() {
  const usageQuery = trpc.workspace.usage.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
  });
  const usage = usageQuery.data;
  const usageMetrics = usage
    ? (
        [
          ["apiRequests", "API"],
          ["aiRequests", "Execuções de IA"],
          ["outboundMessages", "Mensagens outbound"],
        ] as const
      ).map(([key, label]) => ({ key, label, ...usage.workspace[key] }))
    : [];
  const usagePercent = (used: number, limit: number) =>
    limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const resetTime = usage
    ? new Date(usage.resetsAt).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;

  return (
    <PanelLayout
      eyebrow="Workspace · Plano"
      title="Planos e consumo"
      description="Acompanhe o plano atual, os limites do workspace e a janela de renovação, separados da configuração das instâncias WhatsApp."
      actions={
        <button
          type="button"
          className="btn-secondary"
          disabled={usageQuery.isFetching}
          onClick={() => void usageQuery.refetch()}
        >
          <RefreshCw
            size={14}
            className={usageQuery.isFetching ? "spin" : undefined}
          />
          Atualizar consumo
        </button>
      }
    >
      <div className="workspace-usage-page">
        <section className="surface workspace-plan-hero">
          <div>
            <span className="eyebrow">PLANO ATUAL</span>
            <h2>{usage ? `Plano ${usage.plan}` : "Plano do workspace"}</h2>
            <p>
              {resetTime
                ? `Janela atual até ${resetTime}.`
                : "A cota e o período serão exibidos quando os dados carregarem."}
            </p>
          </div>
          <StatusBadge tone={usageQuery.error ? "red" : "green"}>
            {usageQuery.isFetching
              ? "Atualizando"
              : usageQuery.error
                ? "Indisponível"
                : "Ao vivo"}
          </StatusBadge>
        </section>

        {usageQuery.isLoading ? (
          <div className="surface workspace-usage-message" role="status">
            Carregando cotas e consumo...
          </div>
        ) : usageQuery.error ? (
          <div className="form-error" role="alert">
            {usageQuery.error.message}
          </div>
        ) : usage ? (
          <div className="workspace-usage-grid">
            {usageMetrics.map(metric => {
              const percent = usagePercent(metric.used, metric.limit);
              return (
                <article
                  className="surface workspace-usage-metric"
                  key={metric.key}
                >
                  <div className="workspace-usage-metric-heading">
                    <span>{metric.label}</span>
                    <Gauge
                      size={16}
                      className={percent >= 80 ? "amber" : "green"}
                    />
                  </div>
                  <strong>
                    {metric.used.toLocaleString("pt-BR")}{" "}
                    <small>/ {metric.limit.toLocaleString("pt-BR")}</small>
                  </strong>
                  <p>
                    {Math.max(0, metric.limit - metric.used).toLocaleString(
                      "pt-BR"
                    )}{" "}
                    restantes · {percent}% usado
                  </p>
                  <div
                    className="workspace-usage-progress"
                    role="progressbar"
                    aria-label={`${metric.label}: ${percent}% usado`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <span
                      className={percent >= 80 ? "is-high" : ""}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="surface workspace-usage-message">
            Não há dados de consumo para exibir neste momento.
          </div>
        )}

        <p className="workspace-usage-note">
          Os limites apresentados são do workspace. Esta página é apenas
          informativa; não altera o plano nem as chaves de integração.
        </p>
      </div>
    </PanelLayout>
  );
}
