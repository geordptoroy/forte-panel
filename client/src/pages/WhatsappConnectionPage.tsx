import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Gauge,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  getCountries,
  getCountryCallingCode,
  isPossiblePhoneNumber,
  type CountryCode,
} from "libphonenumber-js";
import PanelLayout, { EmptyState, StatusBadge } from "@/components/PanelLayout";
import { baileysStatusPollingInterval } from "@/lib/baileys-status";
import { trpc } from "@/lib/trpc";

function WhatsappMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="whatsapp-mark"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
    >
      <circle cx="16" cy="16" r="15" fill="currentColor" />
      <path
        fill="#f5f5f5"
        d="M22.3 9.7a8.8 8.8 0 0 0-13.8 10L7.4 24.8l5.2-1.1a8.8 8.8 0 0 0 9.7-14Zm-6.2 12.3a7.2 7.2 0 0 1-3.7-1l-.3-.2-2.3.5.5-2.2-.2-.3a7.2 7.2 0 1 1 6 3.2Zm3.9-5.4c-.2-.1-1.2-.6-1.4-.7-.2-.1-.3-.1-.5.1l-.6.8c-.2.2-.3.2-.5.1a5.9 5.9 0 0 1-1.7-1 6.5 6.5 0 0 1-1.2-1.5c-.1-.2 0-.3.1-.4l.4-.5c.1-.1.1-.3.2-.4.1-.2 0-.3 0-.4l-.6-1.5c-.2-.4-.3-.4-.5-.4h-.4c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3.9 2.5c.1.2 1.6 2.5 3.9 3.4.5.2.9.3 1.2.4.5.1.9.1 1.2.1.4-.1 1.2-.5 1.3-1 .2-.5.2-.9.1-1-.1-.2-.3-.2-.5-.3Z"
      />
    </svg>
  );
}

const countryFlag = (country: string) =>
  /^[A-Z]{2}$/.test(country)
    ? String.fromCodePoint(
        ...country.split("").map(character => 127397 + character.charCodeAt(0))
      )
    : "•";

const phoneCountryOptions = getCountries()
  .map(country => ({
    country,
    callingCode: getCountryCallingCode(country),
    flag: countryFlag(country),
  }))
  .sort((left, right) => left.callingCode.localeCompare(right.callingCode));

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

type SetupStep = 1 | 2 | 3;

export function WhatsappConnectionPage() {
  return (
    <PanelLayout
      eyebrow="Core · Baileys"
      title="Conectar WhatsApp"
      description="Crie uma única instância para este workspace e escolha a forma mais simples de conectar seu número."
    >
      <BaileysConnectionManager />
    </PanelLayout>
  );
}

function BaileysConnectionManager() {
  const utils = trpc.useUtils();
  const [createOpen, setCreateOpen] = useState(false);
  const [setupStep, setSetupStep] = useState<SetupStep>(1);
  const [nameDraft, setNameDraft] = useState("");
  const [createdInstanceId, setCreatedInstanceId] = useState<string | null>(
    null
  );
  const [createdInstanceName, setCreatedInstanceName] = useState("");
  const [connectionMode, setConnectionMode] = useState<"qr" | "phone">("qr");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>("BR");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
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
    onSuccess: async result => {
      setCreatedInstanceId(result.instanceId);
      setCreatedInstanceName(result.name);
      setSetupStep(2);
      await utils.workspace.baileysInstances.invalidate();
    },
  });
  const connect = trpc.workspace.connectBaileys.useMutation({
    onSuccess: async () => {
      await utils.workspace.baileysInstances.invalidate();
      setCreateOpen(false);
    },
  });
  const pairing = trpc.workspace.requestBaileysPairingCode.useMutation({
    onSuccess: async result => {
      setPairingCode(result.code);
      setSetupStep(3);
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

  useEffect(() => {
    if (
      !createOpen ||
      !createdInstanceId ||
      instanceStatuses[createdInstanceId] !== "connected"
    )
      return;
    setCreateOpen(false);
    setPairingCode(null);
    setSetupStep(1);
  }, [createOpen, createdInstanceId, instanceStatuses]);

  const total = instances.data?.length;
  const statusesReady =
    total !== undefined && Object.keys(instanceStatuses).length >= total;
  const connectedCount = Object.values(instanceStatuses).filter(
    status => status === "connected"
  ).length;
  const pendingCount = Object.values(instanceStatuses).filter(status =>
    ["connecting", "pairing", "qr"].includes(status)
  ).length;
  const localPhoneDigits = phone.replace(/\D/g, "");
  const fullPhone = `+${getCountryCallingCode(countryCode)}${localPhoneDigits}`;
  const phoneIsPossible = isPossiblePhoneNumber(fullPhone);

  const openCreate = () => {
    setNameDraft("");
    setCreatedInstanceId(null);
    setCreatedInstanceName("");
    setConnectionMode("qr");
    setPhone("");
    setCountryCode("BR");
    setPairingCode(null);
    setSetupStep(1);
    create.reset();
    pairing.reset();
    setCreateOpen(true);
  };
  const closeCreate = () => {
    if (create.isPending || connect.isPending || pairing.isPending) return;
    setCreateOpen(false);
  };

  return (
    <div className="whatsapp-page-stack">
      <section
        className="whatsapp-summary-grid"
        aria-label="Resumo da conexão WhatsApp"
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
        className="whatsapp-create-strip surface"
        aria-labelledby="create-instance-strip-title"
      >
        <div>
          <span className="eyebrow">Próximo passo</span>
          <h2 id="create-instance-strip-title">
            Conecte uma instância WhatsApp
          </h2>
          <p>
            Crie o nome uma vez e escolha QR Code ou número no próximo passo.
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={openCreate}>
          <Plus size={15} /> Criar instância
        </button>
      </section>

      <section
        className="whatsapp-instances-section"
        aria-labelledby="instance-list-title"
      >
        <div className="whatsapp-list-heading">
          <div>
            <span className="eyebrow">Sessões do workspace</span>
            <h2 id="instance-list-title">Suas instâncias</h2>
            <p>O status é atualizado automaticamente pelo gateway Baileys.</p>
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
              />{" "}
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
              description="Clique em Criar instância para começar a conexão do seu WhatsApp."
            />
          </div>
        )}
      </section>

      {createOpen && (
        <div
          className="connection-wizard-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-instance-title"
        >
          <div className="connection-wizard connection-setup-dialog">
            <button
              type="button"
              className="connection-wizard-close"
              onClick={closeCreate}
              aria-label="Fechar criação de instância"
            >
              <X size={16} />
            </button>
            <div className="setup-dialog-brand">
              <WhatsappMark size={26} />
              <span>Nova conexão</span>
              <small>Etapa {setupStep} de 3</small>
            </div>
            {setupStep === 1 && (
              <>
                <h2 id="create-instance-title">Dê um nome à sua instância</h2>
                <p className="muted">
                  Esse nome ajuda sua equipe a reconhecer o número conectado.
                  Você poderá alterá-lo depois.
                </p>
                <label className="form-field" htmlFor="new-instance-name">
                  <span>Nome da instância</span>
                  <input
                    id="new-instance-name"
                    className="input-control"
                    autoFocus
                    maxLength={120}
                    value={nameDraft}
                    onChange={event => setNameDraft(event.target.value)}
                    placeholder="Ex.: WhatsApp Comercial"
                  />
                </label>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={create.isPending || nameDraft.trim().length < 2}
                  onClick={() => create.mutate({ name: nameDraft.trim() })}
                >
                  {create.isPending ? "Criando..." : "Avançar"}
                  <span aria-hidden="true">→</span>
                </button>
                {create.error && (
                  <div className="form-error" role="alert">
                    {create.error.message}
                  </div>
                )}
              </>
            )}
            {setupStep === 2 && (
              <>
                <h2 id="create-instance-title">Como você quer conectar?</h2>
                <p className="muted">
                  Instância{" "}
                  <strong className="dialog-instance-name">
                    {createdInstanceName}
                  </strong>{" "}
                  criada. Escolha um método para parear o WhatsApp.
                </p>
                <div className="connection-mode-switch">
                  <button
                    type="button"
                    className={connectionMode === "qr" ? "is-active" : ""}
                    onClick={() => setConnectionMode("qr")}
                  >
                    <QrCode size={19} />
                    <strong>QR Code</strong>
                    <small>Leia com a câmera do celular</small>
                  </button>
                  <button
                    type="button"
                    className={connectionMode === "phone" ? "is-active" : ""}
                    onClick={() => setConnectionMode("phone")}
                  >
                    <span className="mode-phone-icon">#</span>
                    <strong>Por número</strong>
                    <small>Receba um código no WhatsApp</small>
                  </button>
                </div>
                {connectionMode === "qr" ? (
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={connect.isPending || !createdInstanceId}
                    onClick={() =>
                      createdInstanceId &&
                      connect.mutate({ instanceId: createdInstanceId })
                    }
                  >
                    {connect.isPending
                      ? "Gerando QR Code..."
                      : "Continuar com QR Code"}
                    <span aria-hidden="true">→</span>
                  </button>
                ) : (
                  <>
                    <div className="phone-entry-group setup-phone-entry">
                      <label className="form-field">
                        <span>DDI</span>
                        <select
                          className="input-control flag-ddi-select"
                          value={countryCode}
                          aria-label="Bandeira e DDI"
                          onChange={event =>
                            setCountryCode(event.target.value as CountryCode)
                          }
                        >
                          {phoneCountryOptions.map(option => (
                            <option key={option.country} value={option.country}>
                              {option.flag} +{option.callingCode}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-field">
                        <span>Número</span>
                        <input
                          className="input-control"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel-national"
                          value={phone}
                          onChange={event => setPhone(event.target.value)}
                          placeholder="DDD e número"
                        />
                      </label>
                    </div>
                    <small className="muted phone-number-hint">
                      Digite o número sem o DDI; a bandeira selecionada
                      acrescenta o código automaticamente.
                    </small>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={
                        pairing.isPending ||
                        !phoneIsPossible ||
                        !createdInstanceId
                      }
                      onClick={() => {
                        if (createdInstanceId)
                          pairing.mutate({
                            instanceId: createdInstanceId,
                            phone: fullPhone,
                          });
                      }}
                    >
                      {pairing.isPending
                        ? "Aguardando WhatsApp..."
                        : "Continuar com número"}
                      <span aria-hidden="true">→</span>
                    </button>
                  </>
                )}
                {(connect.error || pairing.error) && (
                  <div className="form-error" role="alert">
                    {connect.error?.message ?? pairing.error?.message}
                  </div>
                )}
              </>
            )}
            {setupStep === 3 && (
              <div className="connection-wizard-finish">
                <span className="setup-success-icon">
                  <CheckCircle2 size={28} />
                </span>
                <h2 id="create-instance-title">Código pronto</h2>
                <p className="muted">
                  No celular, abra WhatsApp → Aparelhos conectados → Conectar
                  aparelho → Conectar com número de telefone.
                </p>
                <div className="pairing-code">{pairingCode}</div>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={closeCreate}
                >
                  Fechar e acompanhar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState<CountryCode>("BR");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(name);
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
  const profile = trpc.workspace.baileysProfile.useQuery(
    { instanceId },
    {
      enabled: connected,
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
      refetchOnWindowFocus: "always",
      retry: false,
    }
  );
  const profilePhone = profile.data?.phoneNumber ?? current?.phoneNumber;
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
      setRenameOpen(false);
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
          {profile.data?.profilePictureUrl ? (
            <img
              src={profile.data.profilePictureUrl}
              alt={`Foto de ${profile.data.pushName ?? name}`}
            />
          ) : (
            <WhatsappMark size={23} />
          )}
        </div>
        <div className="whatsapp-instance-identity">
          <div className="whatsapp-instance-overline">
            SESSÃO BAILEYS <code>{instanceId}</code>
          </div>
          <h3>{name}</h3>
          <p>
            {profile.data?.pushName ? `${profile.data.pushName} · ` : ""}
            {profilePhone
              ? `Número conectado: ${profilePhone}`
              : stateDetails.detail}
          </p>
        </div>
        <div className="whatsapp-instance-status">
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
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
            />{" "}
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
      <div className="whatsapp-instance-toolbar">
        <span>Configurações da instância</span>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setNameDraft(name);
            setRenameOpen(true);
          }}
        >
          <Pencil size={13} /> Alterar
        </button>
      </div>
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
              <span className="whatsapp-method-icon">
                <QrCode size={17} />
              </span>
              <div>
                <span className="eyebrow">Recomendado</span>
                <h4 id={`qr-method-${instanceId}`}>Conectar com QR Code</h4>
                <p>Leia o código em Aparelhos conectados.</p>
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
                ? "Preparando..."
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
                QR temporariamente indisponível. Atualize a conexão.
              </small>
            )}
            {connect.error && (
              <div className="form-error" role="alert">
                {connect.error.message}
              </div>
            )}
          </section>
          <section
            className="whatsapp-method-card whatsapp-phone-method"
            aria-labelledby={`phone-method-${instanceId}`}
          >
            <div className="whatsapp-method-heading">
              <span className="whatsapp-method-icon mode-phone-icon">#</span>
              <div>
                <span className="eyebrow">Alternativa</span>
                <h4 id={`phone-method-${instanceId}`}>Conectar com número</h4>
                <p>Use um código quando não puder ler o QR.</p>
              </div>
            </div>
            <div className="phone-entry-group">
              <label className="form-field">
                <span>DDI</span>
                <select
                  className="input-control flag-ddi-select"
                  value={countryCode}
                  aria-label="Bandeira e DDI"
                  onChange={event =>
                    setCountryCode(event.target.value as CountryCode)
                  }
                >
                  {phoneCountryOptions.map(option => (
                    <option key={option.country} value={option.country}>
                      {option.flag} +{option.callingCode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Número</span>
                <input
                  className="input-control"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={event => setPhone(event.target.value)}
                  placeholder="DDD e número"
                />
              </label>
            </div>
            <small className="muted phone-number-hint">
              O DDI é acrescentado automaticamente.
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
              {pairing.isPending ? "Aguardando WhatsApp..." : "Gerar código"}
            </button>
            {pairingCode && (
              <div className="whatsapp-pairing-result" aria-live="polite">
                <span className="eyebrow">Código aceito pelo WhatsApp</span>
                <div className="pairing-code">{pairingCode}</div>
                <small>
                  No celular: Aparelhos conectados → Conectar aparelho →
                  Conectar com número de telefone.
                </small>
              </div>
            )}
            {pairing.error && (
              <div className="form-error" role="alert">
                {pairing.error.message}
              </div>
            )}
          </section>
        </div>
      )}
      <footer className="whatsapp-instance-footer">
        <span>Status sincronizado automaticamente com o gateway.</span>
        <button
          type="button"
          className="btn-ghost whatsapp-delete-button"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={14} /> Excluir instância
        </button>
      </footer>
      {renameOpen && (
        <div
          className="connection-wizard-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`rename-${instanceId}`}
        >
          <div className="connection-wizard compact-dialog">
            <button
              type="button"
              className="connection-wizard-close"
              onClick={() => setRenameOpen(false)}
              aria-label="Fechar renomeação"
            >
              <X size={16} />
            </button>
            <span className="eyebrow">Editar instância</span>
            <h2 id={`rename-${instanceId}`}>Renomear conexão</h2>
            <p className="muted">
              O novo nome será exibido para toda a equipe.
            </p>
            <label className="form-field">
              <span>Nome da instância</span>
              <input
                className="input-control"
                autoFocus
                value={nameDraft}
                onChange={event => setNameDraft(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn-primary"
              disabled={
                rename.isPending ||
                nameDraft.trim().length < 2 ||
                nameDraft.trim() === name
              }
              onClick={() =>
                rename.mutate({ instanceId, name: nameDraft.trim() })
              }
            >
              {rename.isPending ? "Salvando..." : "Salvar nome"}
            </button>
            {rename.error && (
              <div className="form-error" role="alert">
                {rename.error.message}
              </div>
            )}
          </div>
        </div>
      )}
      {confirmDelete && (
        <div
          className="connection-wizard-backdrop"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`delete-${instanceId}`}
        >
          <div className="connection-wizard compact-dialog">
            <button
              type="button"
              className="connection-wizard-close"
              onClick={() => setConfirmDelete(false)}
              aria-label="Cancelar exclusão"
            >
              <X size={16} />
            </button>
            <span className="eyebrow">Ação permanente</span>
            <h2 id={`delete-${instanceId}`}>Excluir “{name}”?</h2>
            <p className="muted">
              A sessão será encerrada e removida do gateway. Para usar este
              número novamente, será necessário criar e parear outra instância.
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
              <div className="form-error" role="alert">
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
      description="Acompanhe o plano atual, os limites do workspace e a janela de renovação."
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
          />{" "}
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
          informativa.
        </p>
      </div>
    </PanelLayout>
  );
}
