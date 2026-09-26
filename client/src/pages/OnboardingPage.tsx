import { useEffect, useState } from "react";
import { CheckCircle2, Info, Save, Sparkles } from "lucide-react";
import PanelLayout, { SectionTitle } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";

type Profile = {
  businessName: string;
  segment: string;
  description: string;
  services: string;
  serviceArea: string;
  businessHours: string;
  toneOfVoice: string;
  forbiddenWords: string;
  faq: string;
  cancellationPolicy: string;
  humanHandoffRules: string;
  qualificationRules: string;
};

type ProviderId = "nvidia_nim" | "google_gemini" | "openai_compatible";
type Capability = "text" | "vision" | "audio" | "document";
type AgentConfig = {
  enabled: boolean;
  model: string;
  systemPrompt: string;
  maxSteps: number;
  llm: {
    providers: Record<
      ProviderId,
      { enabled: boolean; baseUrl: string; apiKey: string }
    >;
    routing: Record<Capability, { provider: ProviderId; model: string }>;
  };
};

const emptyProfile: Profile = {
  businessName: "",
  segment: "servicos",
  description: "",
  services: "",
  serviceArea: "",
  businessHours: "",
  toneOfVoice: "profissional, claro e cordial",
  forbiddenWords: "",
  faq: "",
  cancellationPolicy: "",
  humanHandoffRules: "",
  qualificationRules: "",
};

export default function OnboardingPage() {
  const profileQuery = trpc.onboarding.profile.useQuery();
  const agentQuery = trpc.agent.config.useQuery();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({
    enabled: true,
    model: "gpt-5-mini",
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
        text: { provider: "nvidia_nim", model: "meta/llama-3.1-70b-instruct" },
        vision: { provider: "google_gemini", model: "gemini-2.0-flash" },
        audio: { provider: "google_gemini", model: "gemini-2.0-flash" },
        document: { provider: "google_gemini", model: "gemini-2.0-flash" },
      },
    },
  });
  const [published, setPublished] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const saveMutation = trpc.onboarding.save.useMutation({
    onSuccess: result => {
      setPublished(result.published);
      setSavedVersion(result.version);
    },
  });
  const saveAgentMutation = trpc.agent.save.useMutation();

  useEffect(() => {
    if (profileQuery.data) {
      setProfile(profileQuery.data.profile);
      setPublished(profileQuery.data.published);
      setSavedVersion(profileQuery.data.version);
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (agentQuery.data)
      setAgentConfig({
        enabled: agentQuery.data.enabled,
        model: agentQuery.data.model,
        systemPrompt: agentQuery.data.systemPrompt,
        maxSteps: agentQuery.data.maxSteps,
        llm: agentQuery.data.llm,
      });
  }, [agentQuery.data]);

  const update = (key: keyof Profile, value: string) =>
    setProfile(current => ({ ...current, [key]: value }));
  const field = (
    key: keyof Profile,
    label: string,
    placeholder: string,
    multiline = false
  ) => (
    <div className={`form-field ${multiline ? "full" : ""}`}>
      <label htmlFor={`onboarding-${key}`}>{label}</label>
      {multiline ? (
        <textarea
          id={`onboarding-${key}`}
          className="textarea-control"
          value={profile[key]}
          onChange={event => update(key, event.target.value)}
          placeholder={placeholder}
          rows={4}
        />
      ) : (
        <input
          id={`onboarding-${key}`}
          className="input-control"
          value={profile[key]}
          onChange={event => update(key, event.target.value)}
          placeholder={placeholder}
        />
      )}
    </div>
  );

  const providerLabel: Record<ProviderId, string> = {
    nvidia_nim: "NVIDIA NIM",
    google_gemini: "Google Gemini",
    openai_compatible: "Outro OpenAI-compatible",
  };
  const providerDescription: Record<ProviderId, string> = {
    nvidia_nim: "Modelos de texto e raciocínio via endpoint da NVIDIA.",
    google_gemini: "Modelos multimodais para imagem, áudio e documentos.",
    openai_compatible:
      "OpenAI, OpenRouter, Azure ou outro endpoint compatível.",
  };
  const capabilityLabels: Record<
    Capability,
    { title: string; description: string; placeholder: string }
  > = {
    text: {
      title: "Atendimento e respostas",
      description:
        "Entende a conversa, usa as ferramentas e responde ao cliente.",
      placeholder: "Ex.: meta/llama-3.1-70b-instruct",
    },
    vision: {
      title: "Entender imagens",
      description:
        "Analisa fotos, comprovantes e imagens enviadas no WhatsApp.",
      placeholder: "Ex.: gemini-2.0-flash",
    },
    audio: {
      title: "Entender áudios",
      description:
        "Interpreta mensagens de voz e retorna o conteúdo para o agente.",
      placeholder: "Ex.: gemini-2.0-flash",
    },
    document: {
      title: "Ler documentos",
      description: "Analisa PDFs e arquivos recebidos antes de responder.",
      placeholder: "Ex.: gemini-2.0-flash",
    },
  };
  const updateProvider = (
    id: ProviderId,
    patch: Partial<AgentConfig["llm"]["providers"][ProviderId]>
  ) =>
    setAgentConfig(current => ({
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
    setAgentConfig(current => ({
      ...current,
      llm: {
        ...current.llm,
        routing: {
          ...current.llm.routing,
          [capability]: { ...current.llm.routing[capability], ...patch },
        },
      },
    }));
  const saveAgent = () =>
    saveAgentMutation.mutate({
      ...agentConfig,
      model: agentConfig.llm.routing.text.model,
    });
  return (
    <PanelLayout
      eyebrow="Sistema / Configuração"
      title="Agente e configuração da empresa"
      description="Configure separadamente as credenciais e o modelo usado em cada tipo de operação."
    >
      <section className="surface" style={{ padding: 22, marginBottom: 18 }}>
        <SectionTitle
          eyebrow="Agente nativo"
          title="Credenciais e modelos por operação"
        />
        <div className="demo-banner" style={{ marginBottom: 18 }}>
          <Info size={14} />
          <span>
            Cadastre cada provedor uma vez. Depois escolha abaixo qual provedor
            e qual modelo executam cada operação. As chaves existentes aparecem
            mascaradas e são preservadas se você não alterá-las.
          </span>
        </div>
        <div className="form-grid" style={{ marginBottom: 22 }}>
          <div className="form-field">
            <label>Agente ativo</label>
            <select
              className="select-control"
              value={agentConfig.enabled ? "true" : "false"}
              onChange={event =>
                setAgentConfig({
                  ...agentConfig,
                  enabled: event.target.value === "true",
                })
              }
            >
              <option value="true">Ativo</option>
              <option value="false">Pausado</option>
            </select>
          </div>
          <div className="form-field">
            <label>Máximo de etapas por resposta</label>
            <input
              className="input-control"
              type="number"
              min={1}
              max={8}
              value={agentConfig.maxSteps}
              onChange={event =>
                setAgentConfig({
                  ...agentConfig,
                  maxSteps: Math.max(
                    1,
                    Math.min(8, Number(event.target.value) || 1)
                  ),
                })
              }
            />
            <small className="muted">
              Quantidade máxima de chamadas de ferramenta por atendimento.
            </small>
          </div>
        </div>
        <SectionTitle
          eyebrow="1 · Credenciais"
          title="Conecte os provedores que você vai usar"
        />
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          {(Object.keys(providerLabel) as ProviderId[]).map(id => {
            const provider = agentConfig.llm.providers[id];
            return (
              <div
                key={id}
                className="surface"
                style={{ padding: 16, border: "1px solid rgba(0,0,0,.08)" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "start",
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <strong>{providerLabel[id]}</strong>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {providerDescription[id]}
                    </p>
                  </div>
                  <select
                    className="select-control"
                    style={{ width: 130 }}
                    value={provider.enabled ? "true" : "false"}
                    onChange={event =>
                      updateProvider(id, {
                        enabled: event.target.value === "true",
                      })
                    }
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Desativado</option>
                  </select>
                </div>
                <div className="form-grid">
                  <div className="form-field">
                    <label>URL base da API</label>
                    <input
                      className="input-control"
                      value={provider.baseUrl}
                      onChange={event =>
                        updateProvider(id, { baseUrl: event.target.value })
                      }
                      placeholder={
                        id === "nvidia_nim"
                          ? "https://integrate.api.nvidia.com/v1"
                          : id === "google_gemini"
                            ? "https://generativelanguage.googleapis.com/v1beta/openai"
                            : "https://api.seu-provedor.com/v1"
                      }
                    />
                  </div>
                  <div className="form-field">
                    <label>Chave da API</label>
                    <input
                      className="input-control"
                      type="password"
                      value={provider.apiKey}
                      onChange={event =>
                        updateProvider(id, { apiKey: event.target.value })
                      }
                      placeholder={
                        provider.apiKey
                          ? "Chave cadastrada — deixe sem alterar"
                          : "Cole a chave aqui"
                      }
                    />
                    <small className="muted">
                      A chave fica criptografada no workspace.
                    </small>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <SectionTitle
          eyebrow="2 · Roteamento"
          title="Escolha um modelo para cada operação"
        />
        <p className="muted" style={{ marginTop: 0 }}>
          Você não precisa usar o mesmo modelo para tudo. O agente seleciona
          automaticamente a operação correspondente quando chega texto, imagem,
          áudio ou documento.
        </p>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {(["text", "vision", "audio", "document"] as Capability[]).map(
            capability => {
              const route = agentConfig.llm.routing[capability];
              const info = capabilityLabels[capability];
              return (
                <div
                  key={capability}
                  className="surface"
                  style={{ padding: 16, border: "1px solid rgba(0,0,0,.08)" }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <strong>{info.title}</strong>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {info.description}
                    </p>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(180px, .7fr) minmax(260px, 1fr)",
                      gap: 10,
                    }}
                  >
                    <div className="form-field">
                      <label>Provedor</label>
                      <select
                        className="select-control"
                        value={route.provider}
                        onChange={event =>
                          updateRoute(capability, {
                            provider: event.target.value as ProviderId,
                          })
                        }
                      >
                        {(Object.keys(providerLabel) as ProviderId[]).map(
                          id => (
                            <option key={id} value={id}>
                              {providerLabel[id]}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Modelo exato</label>
                      <input
                        className="input-control"
                        value={route.model}
                        onChange={event =>
                          updateRoute(capability, { model: event.target.value })
                        }
                        placeholder={info.placeholder}
                      />
                      <small className="muted">
                        Use o ID exatamente como aparece no painel do provedor.
                      </small>
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>
        <div className="demo-banner" style={{ marginTop: 14, marginBottom: 0 }}>
          <Info size={14} />
          <span>
            Configuração recomendada: NVIDIA NIM para atendimento/texto e Gemini
            para imagem, áudio e documentos. Se o seu modelo NVIDIA tiver
            capacidade multimodal, você pode selecioná-lo também, desde que ele
            aceite o tipo de conteúdo enviado.
          </span>
        </div>
        <SectionTitle
          eyebrow="3 · Instruções"
          title="Comportamento do agente"
        />
        <div className="form-field full">
          <label>System prompt próprio do agente</label>
          <textarea
            className="textarea-control"
            rows={8}
            value={agentConfig.systemPrompt}
            onChange={event =>
              setAgentConfig({
                ...agentConfig,
                systemPrompt: event.target.value,
              })
            }
            placeholder="Opcional. Se vazio, o agente usa o prompt operacional publicado abaixo."
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 16,
          }}
        >
          <button
            className="btn-primary"
            disabled={saveAgentMutation.isPending}
            onClick={saveAgent}
          >
            {saveAgentMutation.isPending
              ? "Salvando..."
              : "Salvar configuração do agente"}
          </button>
          {saveAgentMutation.isSuccess && (
            <span className="green">
              <CheckCircle2
                size={14}
                style={{ verticalAlign: "middle", marginRight: 5 }}
              />
              Configuração salva
            </span>
          )}
          {saveAgentMutation.error && (
            <span className="form-error">
              {saveAgentMutation.error.message}
            </span>
          )}
        </div>
      </section>
      <div className="surface" style={{ padding: 18, marginBottom: 18 }}>
        <div className="demo-banner" style={{ margin: 0 }}>
          <Info size={15} />
          <span>
            O perfil estruturado é a fonte de verdade. Salvar rascunho não
            altera o agente; publicar cria uma nova versão operacional.
          </span>
        </div>
      </div>
      <section className="surface" style={{ padding: 22 }}>
        <SectionTitle eyebrow="Identidade do negócio" title="Sobre a empresa" />
        <div className="form-grid">
          {field("businessName", "Nome da empresa", "Ex.: Clínica Vida Plena")}
          {field(
            "segment",
            "Segmento",
            "Ex.: clínica, salão, barbearia, elétrica"
          )}
          {field(
            "description",
            "Descrição do negócio",
            "O que a empresa faz e para quem atende",
            true
          )}
          {field(
            "services",
            "Serviços, preços e duração",
            "Um serviço por linha. Inclua regras de orçamento.",
            true
          )}
          {field(
            "serviceArea",
            "Cidade e área de atendimento",
            "Cidades, bairros e deslocamento",
            true
          )}
          {field(
            "businessHours",
            "Horários e profissionais",
            "Dias, horários e quem atende",
            true
          )}
        </div>
      </section>
      <section className="surface" style={{ padding: 22, marginTop: 18 }}>
        <SectionTitle
          eyebrow="Comportamento da IA"
          title="Regras de atendimento"
        />
        <div className="form-grid">
          {field(
            "toneOfVoice",
            "Tom de voz",
            "Ex.: acolhedor, direto, sem emojis"
          )}
          {field(
            "forbiddenWords",
            "Condutas proibidas",
            "O que nunca prometer ou dizer",
            true
          )}
          {field(
            "faq",
            "Perguntas frequentes e respostas aprovadas",
            "Cole perguntas e respostas que a equipe já aprovou",
            true
          )}
          {field(
            "cancellationPolicy",
            "Cancelamento, reagendamento e sinal",
            "Regras que podem ser informadas ao cliente",
            true
          )}
          {field(
            "humanHandoffRules",
            "Quando chamar um humano",
            "Reclamações, negociação, risco, pedido de humano...",
            true
          )}
          {field(
            "qualificationRules",
            "Qualificação e follow-up",
            "Dados que o agente precisa coletar antes do próximo passo",
            true
          )}
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 20,
            flexWrap: "wrap",
          }}
        >
          <button
            className="btn-secondary"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate({ profile, publish: false })}
          >
            <Save size={13} /> Salvar rascunho
          </button>
          <button
            className="btn-primary"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate({ profile, publish: true })}
          >
            <Sparkles size={13} />{" "}
            {saveMutation.isPending ? "Gerando..." : "Gerar e publicar prompt"}
          </button>
          {published && (
            <span
              className="green"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
              }}
            >
              <CheckCircle2 size={14} /> Prompt v{savedVersion} publicado
            </span>
          )}
        </div>
        {saveMutation.error && (
          <div
            className="demo-banner"
            style={{ marginTop: 14, marginBottom: 0 }}
          >
            <Info size={14} /> {saveMutation.error.message}
          </div>
        )}
      </section>
    </PanelLayout>
  );
}
