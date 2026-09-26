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
type AgentConfig = { enabled: boolean; model: string; systemPrompt: string; maxSteps: number; llm: { providers: Record<ProviderId, { enabled: boolean; baseUrl: string; apiKey: string }>; routing: Record<Capability, { provider: ProviderId; model: string }> } };

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
  const modelsQuery = trpc.agent.models.useQuery();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [agentConfig, setAgentConfig] = useState<AgentConfig>({ enabled: true, model: "gpt-5-mini", systemPrompt: "", maxSteps: 6, llm: { providers: { nvidia_nim: { enabled: false, baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: "" }, google_gemini: { enabled: false, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "" }, openai_compatible: { enabled: false, baseUrl: "", apiKey: "" } }, routing: { text: { provider: "nvidia_nim", model: "meta/llama-3.1-70b-instruct" }, vision: { provider: "google_gemini", model: "gemini-2.0-flash" }, audio: { provider: "google_gemini", model: "gemini-2.0-flash" }, document: { provider: "google_gemini", model: "gemini-2.0-flash" } } } });
  const [published, setPublished] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const saveMutation = trpc.onboarding.save.useMutation({
    onSuccess: (result) => {
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
    if (agentQuery.data) setAgentConfig({ enabled: agentQuery.data.enabled, model: agentQuery.data.model, systemPrompt: agentQuery.data.systemPrompt, maxSteps: agentQuery.data.maxSteps, llm: agentQuery.data.llm });
  }, [agentQuery.data]);

  const update = (key: keyof Profile, value: string) => setProfile((current) => ({ ...current, [key]: value }));
  const field = (key: keyof Profile, label: string, placeholder: string, multiline = false) => (
    <div className={`form-field ${multiline ? "full" : ""}`}>
      <label htmlFor={`onboarding-${key}`}>{label}</label>
      {multiline ? <textarea id={`onboarding-${key}`} className="textarea-control" value={profile[key]} onChange={(event) => update(key, event.target.value)} placeholder={placeholder} rows={4} /> : <input id={`onboarding-${key}`} className="input-control" value={profile[key]} onChange={(event) => update(key, event.target.value)} placeholder={placeholder} />}
    </div>
  );

  const saveAgent = () => saveAgentMutation.mutate(agentConfig);
  const providerLabel: Record<ProviderId, string> = { nvidia_nim: "NVIDIA NIM", google_gemini: "Google Gemini", openai_compatible: "Outro OpenAI-compatible" };
  const updateProvider = (id: ProviderId, patch: Partial<AgentConfig["llm"]["providers"][ProviderId]>) => setAgentConfig((current) => ({ ...current, llm: { ...current.llm, providers: { ...current.llm.providers, [id]: { ...current.llm.providers[id], ...patch } } } }));
  const updateRoute = (capability: Capability, patch: Partial<AgentConfig["llm"]["routing"][Capability]>) => setAgentConfig((current) => ({ ...current, llm: { ...current.llm, routing: { ...current.llm.routing, [capability]: { ...current.llm.routing[capability], ...patch } } } }));
  return <PanelLayout eyebrow="Sistema / Configuração" title="Agente e configuração da empresa" description="O agente nativo do Forte Panel atende, agenda, registra dados e envia pelo WhatsApp.">
    <section className="surface" style={{ padding: 22, marginBottom: 18 }}>
      <SectionTitle eyebrow="Agente nativo" title="Modelo, prompt e credenciais" />
      <div className="demo-banner" style={{ marginBottom: 16 }}><Info size={14} /><span>As chaves de API continuam protegidas no ambiente do servidor. Esta tela altera o comportamento do agente, não expõe segredos.</span></div>
      <div className="form-grid">
        <div className="form-field"><label>Agente ativo</label><select className="select-control" value={agentConfig.enabled ? "true" : "false"} onChange={(event) => setAgentConfig({ ...agentConfig, enabled: event.target.value === "true" })}><option value="true">Ativo</option><option value="false">Pausado</option></select></div>
        <div className="form-field"><label>Modelo de IA</label><select className="select-control" value={agentConfig.model} onChange={(event) => setAgentConfig({ ...agentConfig, model: event.target.value })}><option value={agentConfig.model}>{agentConfig.model}</option>{(modelsQuery.data?.data ?? []).filter((model) => model.id !== agentConfig.model).map((model) => <option key={model.id} value={model.id}>{model.id}</option>)}</select></div>
        <div className="form-field"><label>Máximo de etapas por resposta</label><input className="input-control" type="number" min={1} max={8} value={agentConfig.maxSteps} onChange={(event) => setAgentConfig({ ...agentConfig, maxSteps: Math.max(1, Math.min(8, Number(event.target.value) || 1)) })} /></div>
        <div className="form-field"><label>Credencial de IA</label><input className="input-control" value={agentQuery.data?.credentials.llmConfigured ? "Configurada no ambiente do servidor" : "Não configurada"} readOnly /></div>
        <div className="form-field"><label>Credencial PAPI</label><input className="input-control" value={agentQuery.data?.credentials.papiConfigured ? "Configurada no ambiente do servidor" : "Não configurada"} readOnly /></div>
        {(Object.keys(providerLabel) as ProviderId[]).map((id) => <div className="form-field full" key={id}><label>{providerLabel[id]}</label><div style={{ display: "grid", gridTemplateColumns: "minmax(150px, .35fr) minmax(220px, 1fr) minmax(220px, 1fr)", gap: 8 }}><select className="select-control" value={agentConfig.llm.providers[id].enabled ? "true" : "false"} onChange={(event) => updateProvider(id, { enabled: event.target.value === "true" })}><option value="true">Ativo</option><option value="false">Desativado</option></select><input className="input-control" value={agentConfig.llm.providers[id].baseUrl} onChange={(event) => updateProvider(id, { baseUrl: event.target.value })} placeholder="URL base da API" /><input className="input-control" type="password" value={agentConfig.llm.providers[id].apiKey} onChange={(event) => updateProvider(id, { apiKey: event.target.value })} placeholder={agentConfig.llm.providers[id].apiKey ? "Chave cadastrada — deixe como está" : "Cole a chave aqui"} /></div></div>)}
        <div className="form-field full"><label>Roteamento por tipo de conteúdo</label><div style={{ display: "grid", gap: 8 }}>{(["text", "vision", "audio", "document"] as Capability[]).map((capability) => <div key={capability} style={{ display: "grid", gridTemplateColumns: "120px minmax(170px, .5fr) minmax(220px, 1fr)", gap: 8, alignItems: "center" }}><strong style={{ fontSize: 12 }}>{capability === "text" ? "Texto" : capability === "vision" ? "Imagem" : capability === "audio" ? "Áudio" : "Documentos"}</strong><select className="select-control" value={agentConfig.llm.routing[capability].provider} onChange={(event) => updateRoute(capability, { provider: event.target.value as ProviderId })}>{(Object.keys(providerLabel) as ProviderId[]).map((id) => <option key={id} value={id}>{providerLabel[id]}</option>)}</select><input className="input-control" value={agentConfig.llm.routing[capability].model} onChange={(event) => updateRoute(capability, { model: event.target.value })} placeholder="ID do modelo" /></div>)}</div><small className="muted">Exemplo: NVIDIA NIM para texto, Gemini para imagens, áudio e PDFs. Cada entrada usa o modelo da capacidade correspondente.</small></div>
        <div className="form-field full"><label>System prompt próprio do agente</label><textarea className="textarea-control" rows={8} value={agentConfig.systemPrompt} onChange={(event) => setAgentConfig({ ...agentConfig, systemPrompt: event.target.value })} placeholder="Opcional. Se vazio, o agente usa o prompt operacional publicado abaixo." /></div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}><button className="btn-primary" disabled={saveAgentMutation.isPending} onClick={saveAgent}>{saveAgentMutation.isPending ? "Salvando..." : "Salvar configuração do agente"}</button>{saveAgentMutation.isSuccess && <span className="green"><CheckCircle2 size={14} style={{ verticalAlign: "middle", marginRight: 5 }} />Configuração salva</span>}{saveAgentMutation.error && <span className="form-error">{saveAgentMutation.error.message}</span>}</div>
    </section>
    <div className="surface" style={{ padding: 18, marginBottom: 18 }}><div className="demo-banner" style={{ margin: 0 }}><Info size={15} /><span>O perfil estruturado é a fonte de verdade. Salvar rascunho não altera o agente; publicar cria uma nova versão operacional.</span></div></div>
    <section className="surface" style={{ padding: 22 }}>
      <SectionTitle eyebrow="Identidade do negócio" title="Sobre a empresa" />
      <div className="form-grid">{field("businessName", "Nome da empresa", "Ex.: Clínica Vida Plena")}{field("segment", "Segmento", "Ex.: clínica, salão, barbearia, elétrica")}{field("description", "Descrição do negócio", "O que a empresa faz e para quem atende", true)}{field("services", "Serviços, preços e duração", "Um serviço por linha. Inclua regras de orçamento.", true)}{field("serviceArea", "Cidade e área de atendimento", "Cidades, bairros e deslocamento", true)}{field("businessHours", "Horários e profissionais", "Dias, horários e quem atende", true)}</div>
    </section>
    <section className="surface" style={{ padding: 22, marginTop: 18 }}>
      <SectionTitle eyebrow="Comportamento da IA" title="Regras de atendimento" />
      <div className="form-grid">{field("toneOfVoice", "Tom de voz", "Ex.: acolhedor, direto, sem emojis")}{field("forbiddenWords", "Condutas proibidas", "O que nunca prometer ou dizer", true)}{field("faq", "Perguntas frequentes e respostas aprovadas", "Cole perguntas e respostas que a equipe já aprovou", true)}{field("cancellationPolicy", "Cancelamento, reagendamento e sinal", "Regras que podem ser informadas ao cliente", true)}{field("humanHandoffRules", "Quando chamar um humano", "Reclamações, negociação, risco, pedido de humano...", true)}{field("qualificationRules", "Qualificação e follow-up", "Dados que o agente precisa coletar antes do próximo passo", true)}</div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}><button className="btn-secondary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ profile, publish: false })}><Save size={13} /> Salvar rascunho</button><button className="btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ profile, publish: true })}><Sparkles size={13} /> {saveMutation.isPending ? "Gerando..." : "Gerar e publicar prompt"}</button>{published && <span className="green" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}><CheckCircle2 size={14} /> Prompt v{savedVersion} publicado</span>}</div>
      {saveMutation.error && <div className="demo-banner" style={{ marginTop: 14, marginBottom: 0 }}><Info size={14} /> {saveMutation.error.message}</div>}
    </section>
  </PanelLayout>;
}
