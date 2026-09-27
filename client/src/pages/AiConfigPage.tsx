import { useEffect, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Info,
  MessageSquareText,
  Mic,
  PlugZap,
  Save,
  Sparkles,
} from "lucide-react";
import PanelLayout, { SectionTitle } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";

type ProviderId = "nvidia_nim" | "google_gemini" | "openai_compatible";
type Capability = "text" | "vision" | "audio" | "document";
type ProviderConfig = { enabled: boolean; baseUrl: string; apiKey: string };
type AgentConfig = {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  llm: {
    providers: Record<ProviderId, ProviderConfig>;
    routing: Record<
      Capability,
      { provider: ProviderId; model: string; baseUrl?: string; apiKey?: string }
    >;
  };
};

const initialConfig: AgentConfig = {
  enabled: true,
  model: "meta/llama-3.1-70b-instruct",
  systemPrompt: "",
  maxSteps: 6,
  llm: {
    providers: {
      nvidia_nim: {
        enabled: false,
        baseUrl: "https://integrate.api.nvidia.com/v1",
        apiKey: "",
      },
      google_gemini: {
        enabled: false,
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
        apiKey: "",
      },
      openai_compatible: { enabled: false, baseUrl: "", apiKey: "" },
    },
    routing: {
      text: { provider: "openai_compatible", model: "" },
      vision: { provider: "openai_compatible", model: "" },
      audio: { provider: "openai_compatible", model: "" },
      document: { provider: "openai_compatible", model: "" },
    },
  },
};
const capabilityLabels: Record<
  Capability,
  { title: string; description: string; icon: typeof MessageSquareText }
> = {
  text: {
    title: "API de texto",
    description: "Conversa, ferramentas, agenda e respostas de texto.",
    icon: MessageSquareText,
  },
  vision: {
    title: "API de imagem",
    description: "Fotos, comprovantes e imagens do WhatsApp.",
    icon: ImageIcon,
  },
  audio: {
    title: "API de áudio",
    description: "Mensagens de voz recebidas.",
    icon: Mic,
  },
  document: {
    title: "API de documento",
    description: "PDFs e arquivos recebidos.",
    icon: FileText,
  },
};

export default function AiConfigPage() {
  const agentQuery = trpc.agent.config.useQuery();
  const saveMutation = trpc.agent.save.useMutation();
  const testMutation = trpc.agent.testConnection.useMutation();
  const [config, setConfig] = useState<AgentConfig>(initialConfig);
  const [tested, setTested] = useState<
    Partial<
      Record<
        Capability,
        { ready: boolean; message: string; latencyMs?: number }
      >
    >
  >({});
  useEffect(() => {
    if (agentQuery.data)
      setConfig({ ...agentQuery.data, llm: agentQuery.data.llm });
  }, [agentQuery.data]);
  const updateProvider = (id: ProviderId, patch: Partial<ProviderConfig>) =>
    setConfig(current => ({
      ...current,
      llm: {
        ...current.llm,
        providers: {
          ...current.llm.providers,
          [id]: { ...current.llm.providers[id], ...patch },
        },
      },
    }));
  const updateRoute = (
    capability: Capability,
    patch: Partial<AgentConfig["llm"]["routing"][Capability]>
  ) =>
    setConfig(current => ({
      ...current,
      llm: {
        ...current.llm,
        routing: {
          ...current.llm.routing,
          [capability]: { ...current.llm.routing[capability], ...patch },
        },
      },
    }));
  const save = () =>
    saveMutation.mutate({ ...config, model: config.llm.routing.text.model });
  const testConnection = (capability: Capability) => {
    const route = config.llm.routing[capability];
    const provider = config.llm.providers[route.provider];
    testMutation.mutate(
      {
        capability,
        provider: route.provider,
        baseUrl: route.baseUrl ?? provider.baseUrl,
        apiKey: route.apiKey ?? provider.apiKey,
        model: route.model,
      },
      {
        onSuccess: result =>
          setTested(current => ({
            ...current,
            [capability]: result,
          })),
        onError: error =>
          setTested(current => ({
            ...current,
            [capability]: { ready: false, message: error.message },
          })),
      }
    );
  };
  return (
    <PanelLayout
      eyebrow="Sistema / Inteligência artificial"
      title="APIs por operação"
      description="Configure separadamente a API de texto, imagem, áudio e documento."
    >
      <section className="surface ai-config-hero">
        <div className="ai-config-hero-icon">
          <Sparkles size={20} />
        </div>
        <div>
          <strong>Configuração multimodelo</strong>
          <p>
            Cada operação tem sua própria conexão. Informe somente a URL, a API
            key e o modelo disponibilizado pela API escolhida.
          </p>
        </div>
        <div className="ai-config-status">
          <span className="live-dot" />
          <strong>Agente configurável</strong>
        </div>
      </section>
      <section className="surface ai-config-section">
        <SectionTitle
          eyebrow="Rotas da IA"
          title="Credencial e modelo por operação"
        />
        <div className="demo-banner">
          <Info size={14} />
          <span>
            Cada API é independente. Preencha URL, chave e modelo apenas nas
            operações que você pretende ativar; as chaves ficam criptografadas
            no workspace.
          </span>
        </div>
        <div className="ai-route-list">
          {(["text", "vision", "audio", "document"] as Capability[]).map(
            capability => {
              const route = config.llm.routing[capability];
              const provider = config.llm.providers[route.provider];
              const routeBaseUrl = route.baseUrl ?? provider.baseUrl;
              const routeApiKey = route.apiKey ?? provider.apiKey;
              const info = capabilityLabels[capability];
              const Icon = info.icon;
              const testResult = tested[capability];
              const isConfigured = Boolean(
                routeBaseUrl.trim() && routeApiKey.trim() && route.model.trim()
              );
              return (
                <article
                  className={`ai-route-card ai-route-card-expanded ${isConfigured ? "is-configured" : "is-incomplete"}`}
                  key={capability}
                >
                  <div className="ai-route-top">
                    <div className="ai-route-number">
                      <Icon size={16} strokeWidth={1.8} />
                      <span>
                        {String(
                          ["text", "vision", "audio", "document"].indexOf(
                            capability
                          ) + 1
                        ).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="ai-route-copy">
                      <h2>{info.title}</h2>
                      <p>{info.description}</p>
                    </div>
                    <span
                      className={`ai-route-status ${isConfigured ? "is-ready" : "is-pending"}`}
                    >
                      <span /> {isConfigured ? "Pronta" : "Incompleta"}
                    </span>
                  </div>
                  <div className="ai-route-fields ai-route-fields-four">
                    <label className="form-field">
                      <span>URL da API</span>
                      <input
                        className="input-control"
                        value={routeBaseUrl}
                        onChange={event =>
                          updateRoute(capability, {
                            baseUrl: event.target.value,
                          })
                        }
                        placeholder="https://api.exemplo.com/v1"
                      />
                    </label>
                    <label className="form-field">
                      <span>API key</span>
                      <input
                        className="input-control"
                        type="password"
                        value={routeApiKey}
                        onChange={event =>
                          updateRoute(capability, {
                            apiKey: event.target.value,
                          })
                        }
                        placeholder={
                          routeApiKey
                            ? "Chave cadastrada — não altere"
                            : "Cole a API key desta operação"
                        }
                      />
                      <small>
                        {routeApiKey
                          ? "Credencial cadastrada e mascarada."
                          : "Obrigatória para esta operação."}
                      </small>
                    </label>
                    <label className="form-field">
                      <span>Modelo</span>
                      <input
                        className="input-control"
                        value={route.model}
                        onChange={event =>
                          updateRoute(capability, { model: event.target.value })
                        }
                        placeholder="ID ou nome exato do modelo"
                      />
                      <small>Informe o modelo disponível nessa URL.</small>
                    </label>
                  </div>
                  <div className="ai-route-footer">
                    <button
                      className="btn-secondary ai-test-button"
                      type="button"
                      disabled={testMutation.isPending}
                      onClick={() => testConnection(capability)}
                    >
                      <PlugZap size={13} />
                      {testMutation.isPending
                        ? "Testando..."
                        : "Testar conexão"}
                    </button>
                    {testResult && (
                      <span
                        className={`ai-test-result ${testResult.ready ? "is-ready" : "is-error"}`}
                      >
                        <span />
                        {testResult.message}
                        {testResult.ready && testResult.latencyMs !== undefined
                          ? ` · ${testResult.latencyMs} ms`
                          : ""}
                      </span>
                    )}
                  </div>
                </article>
              );
            }
          )}
        </div>
        <div className="demo-banner ai-recommendation">
          <Info size={14} />
          <span>
            <strong>Sem modelo fixo:</strong> use qualquer endpoint compatível e
            informe o modelo que sua conta disponibiliza em cada API.
          </span>
        </div>
        <div className="ai-config-actions">
          <button
            className="btn-primary"
            disabled={saveMutation.isPending}
            onClick={save}
          >
            <Save size={14} />
            {saveMutation.isPending
              ? "Salvando..."
              : "Salvar modelos e credenciais"}
          </button>
          {saveMutation.isSuccess && (
            <span className="green">
              <CheckCircle2 size={14} /> Configuração salva
            </span>
          )}
          {saveMutation.error && (
            <span className="form-error">{saveMutation.error.message}</span>
          )}
        </div>
      </section>
    </PanelLayout>
  );
}
