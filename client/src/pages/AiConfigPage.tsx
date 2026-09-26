import { useEffect, useState } from "react";
import { CheckCircle2, Info, KeyRound, Save, Sparkles } from "lucide-react";
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
  llm: { providers: Record<ProviderId, ProviderConfig>; routing: Record<Capability, { provider: ProviderId; model: string }> };
};

const initialConfig: AgentConfig = {
  enabled: true,
  model: "meta/llama-3.1-70b-instruct",
  systemPrompt: "",
  maxSteps: 6,
  llm: {
    providers: {
      nvidia_nim: { enabled: false, baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: "" },
      google_gemini: { enabled: false, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "" },
      openai_compatible: { enabled: false, baseUrl: "", apiKey: "" },
    },
    routing: {
      text: { provider: "nvidia_nim", model: "meta/llama-3.1-70b-instruct" },
      vision: { provider: "google_gemini", model: "gemini-2.0-flash" },
      audio: { provider: "google_gemini", model: "gemini-2.0-flash" },
      document: { provider: "google_gemini", model: "gemini-2.0-flash" },
    },
  },
};

const providerLabel: Record<ProviderId, string> = {
  nvidia_nim: "NVIDIA NIM",
  google_gemini: "Google Gemini",
  openai_compatible: "OpenAI-compatible",
};
const providerDescription: Record<ProviderId, string> = {
  nvidia_nim: "Texto e raciocínio com endpoint da NVIDIA.",
  google_gemini: "Imagem, áudio e documentos multimodais.",
  openai_compatible: "OpenAI, OpenRouter, Azure ou endpoint compatível.",
};
const capabilityLabels: Record<Capability, { title: string; description: string; placeholder: string }> = {
  text: { title: "Atendimento e respostas", description: "Conversa normal, ferramentas, agenda e resposta ao cliente.", placeholder: "meta/llama-3.1-70b-instruct" },
  vision: { title: "Entender imagens", description: "Fotos, comprovantes e imagens enviadas no WhatsApp.", placeholder: "gemini-2.0-flash" },
  audio: { title: "Entender áudios", description: "Mensagens de voz recebidas pelo WhatsApp.", placeholder: "gemini-2.0-flash" },
  document: { title: "Ler documentos", description: "PDFs e arquivos recebidos antes da resposta.", placeholder: "gemini-2.0-flash" },
};

export default function AiConfigPage() {
  const agentQuery = trpc.agent.config.useQuery();
  const saveMutation = trpc.agent.save.useMutation();
  const [config, setConfig] = useState<AgentConfig>(initialConfig);

  useEffect(() => {
    if (agentQuery.data) setConfig({ enabled: agentQuery.data.enabled, model: agentQuery.data.model, systemPrompt: agentQuery.data.systemPrompt, maxSteps: agentQuery.data.maxSteps, llm: agentQuery.data.llm });
  }, [agentQuery.data]);

  const updateProvider = (id: ProviderId, patch: Partial<ProviderConfig>) => setConfig(current => ({ ...current, llm: { ...current.llm, providers: { ...current.llm.providers, [id]: { ...current.llm.providers[id], ...patch } } } }));
  const updateRoute = (capability: Capability, patch: Partial<AgentConfig["llm"]["routing"][Capability]>) => setConfig(current => ({ ...current, llm: { ...current.llm, routing: { ...current.llm.routing, [capability]: { ...current.llm.routing[capability], ...patch } } } }));
  const save = () => saveMutation.mutate({ ...config, model: config.llm.routing.text.model });

  return <PanelLayout eyebrow="Sistema / Inteligência artificial" title="Configuração da IA" description="Credenciais, modelos e comportamento do agente nativo em um único lugar.">
    <section className="surface ai-config-hero"><div className="ai-config-hero-icon"><Sparkles size={21} /></div><div><strong>Agente nativo do Forte Panel</strong><p>Configure os provedores uma vez e escolha um modelo específico para cada tipo de operação. A configuração fica isolada deste perfil da empresa.</p></div><div className="ai-config-status"><span className={`live-dot ${config.enabled ? "" : "is-off"}`} /><strong>{config.enabled ? "Ativo" : "Pausado"}</strong></div></section>
    <section className="surface ai-config-section"><SectionTitle eyebrow="1 · Segurança" title="Credenciais dos provedores" /><div className="demo-banner"><KeyRound size={14} /><span>As chaves são armazenadas criptografadas por workspace. Uma chave já cadastrada aparece mascarada; deixe o campo sem alterar para preservá-la.</span></div><div className="ai-provider-list">{(Object.keys(providerLabel) as ProviderId[]).map(id => { const provider = config.llm.providers[id]; return <article className="ai-provider-card" key={id}><div className="ai-provider-heading"><div><h2>{providerLabel[id]}</h2><p>{providerDescription[id]}</p></div><label className="ai-toggle"><span>Usar provedor</span><select className="select-control" value={provider.enabled ? "true" : "false"} onChange={event => updateProvider(id, { enabled: event.target.value === "true" })}><option value="true">Ativo</option><option value="false">Desativado</option></select></label></div><div className="ai-provider-fields"><label className="form-field"><span>URL base da API</span><input className="input-control" value={provider.baseUrl} onChange={event => updateProvider(id, { baseUrl: event.target.value })} placeholder={id === "nvidia_nim" ? "https://integrate.api.nvidia.com/v1" : id === "google_gemini" ? "https://generativelanguage.googleapis.com/v1beta/openai" : "https://api.seu-provedor.com/v1"} /></label><label className="form-field"><span>Chave secreta da API</span><input className="input-control" type="password" value={provider.apiKey} onChange={event => updateProvider(id, { apiKey: event.target.value })} placeholder={provider.apiKey ? "Chave cadastrada — não altere" : "Cole a chave do provedor"} /><small>{provider.apiKey ? "Chave protegida já cadastrada." : "Obrigatória para ativar este provedor."}</small></label></div></article>; })}</div></section>
    <section className="surface ai-config-section"><SectionTitle eyebrow="2 · Modelos" title="Uma rota para cada operação" /><p className="ai-section-intro">O agente escolhe automaticamente a rota pelo tipo da mensagem. Use modelos diferentes quando cada capacidade exigir um provedor especializado.</p><div className="ai-route-list">{(["text", "vision", "audio", "document"] as Capability[]).map(capability => { const route = config.llm.routing[capability]; const info = capabilityLabels[capability]; return <article className="ai-route-card" key={capability}><div className="ai-route-number">{capability === "text" ? "01" : capability === "vision" ? "02" : capability === "audio" ? "03" : "04"}</div><div className="ai-route-copy"><h2>{info.title}</h2><p>{info.description}</p></div><div className="ai-route-fields"><label className="form-field"><span>Provedor</span><select className="select-control" value={route.provider} onChange={event => updateRoute(capability, { provider: event.target.value as ProviderId })}>{(Object.keys(providerLabel) as ProviderId[]).map(id => <option key={id} value={id}>{providerLabel[id]}</option>)}</select></label><label className="form-field"><span>ID exato do modelo</span><input className="input-control" value={route.model} onChange={event => updateRoute(capability, { model: event.target.value })} placeholder={info.placeholder} /><small>Copie o ID conforme aparece no provedor.</small></label></div></article>; })}</div><div className="demo-banner ai-recommendation"><Info size={14} /><span><strong>Recomendação inicial:</strong> NVIDIA NIM para atendimento/texto e Gemini para imagem, áudio e documentos. Se um modelo NVIDIA aceitar os quatro formatos, você pode usá-lo em todas as rotas.</span></div></section>
    <section className="surface ai-config-section"><SectionTitle eyebrow="3 · Operação" title="Comportamento do agente" /><div className="ai-operation-grid"><label className="form-field"><span>Status do agente</span><select className="select-control" value={config.enabled ? "true" : "false"} onChange={event => setConfig({ ...config, enabled: event.target.value === "true" })}><option value="true">Ativo</option><option value="false">Pausado</option></select></label><label className="form-field"><span>Máximo de etapas por resposta</span><input className="input-control" type="number" min={1} max={8} value={config.maxSteps} onChange={event => setConfig({ ...config, maxSteps: Math.max(1, Math.min(8, Number(event.target.value) || 1)) })} /><small>Chamadas de ferramenta permitidas por atendimento.</small></label></div><label className="form-field ai-prompt-field"><span>System prompt adicional</span><textarea className="textarea-control" rows={9} value={config.systemPrompt} onChange={event => setConfig({ ...config, systemPrompt: event.target.value })} placeholder="Opcional. Use para instruções globais do agente. O perfil da empresa continua em Configuração da empresa." /></label><div className="ai-config-actions"><button className="btn-primary" disabled={saveMutation.isPending} onClick={save}><Save size={14} />{saveMutation.isPending ? "Salvando..." : "Salvar configuração da IA"}</button>{saveMutation.isSuccess && <span className="green"><CheckCircle2 size={14} /> Configuração salva</span>}{saveMutation.error && <span className="form-error">{saveMutation.error.message}</span>}</div></section>
  </PanelLayout>;
}
