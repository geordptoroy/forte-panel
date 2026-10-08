import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  Bot,
  Check,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  KeyRound,
  MessageSquareText,
  Mic2,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Video,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type AiConnection = {
  id: number;
  name: string;
  baseUrl: string;
  model: string;
  capability: string;
  status: string;
  createdAt?: string;
};
type GlobalCapabilityPrompt = { capability: string; label: string; instruction: string; enabled: boolean };

type Delivery = { debounceMs: number; waitMs: number; presenceEnabled: boolean };
type ModelCapability = "whatsapp_reply" | "audio_transcription" | "tts" | "image_analysis" | "document_analysis" | "video_analysis" | "prompt_builder" | "moderation" | "embeddings";

type ModelCard = {
  capability: ModelCapability;
  title: string;
  description: string;
  icon: typeof Bot;
};

const modelCards: ModelCard[] = [
  { capability: "whatsapp_reply", title: "Agente de resposta", description: "Único agente que responde ao lead com o prompt do workspace.", icon: Bot },
  { capability: "audio_transcription", title: "Transcrição de áudio", description: "Converte voz em texto antes do agente.", icon: Mic2 },
  { capability: "tts", title: "Resposta por voz", description: "Gera áudio privado com fallback automático para texto.", icon: Volume2 },
  { capability: "image_analysis", title: "Visão", description: "Interpreta imagens recebidas.", icon: ImageIcon },
  { capability: "document_analysis", title: "Documento", description: "Extrai conteúdo de documentos.", icon: FileText },
  { capability: "embeddings", title: "Embeddings vetoriais", description: "Indexa documentos para busca semântica isolada por workspace.", icon: FileText },
  { capability: "video_analysis", title: "Vídeo", description: "Analisa vídeo separadamente de imagem.", icon: Video },
  { capability: "prompt_builder", title: "Montador de prompt", description: "Transforma o onboarding num prompt estruturado.", icon: Sparkles },
  { capability: "moderation", title: "Moderação", description: "Valida entrada e saída antes do consumo de créditos.", icon: ShieldCheck },
];

const outputCards = [
  { key: "text", title: "Texto", description: "Resposta textual normal", icon: MessageSquareText },
  { key: "button", title: "Botão", description: "Texto com ações", icon: MessageSquareText },
  { key: "list", title: "Lista", description: "Opções selecionáveis", icon: FileText },
  { key: "audio", title: "Áudio / TTS", description: "Resposta de voz com fallback para texto", icon: Volume2 },
  { key: "carousel", title: "Carrossel", description: "Itens em sequência", icon: ImageIcon },
  { key: "pix", title: "Pix", description: "Payload Pix estruturado", icon: KeyRound },
] as const;

function ModelCardView({ card, model, status, enabled, fallbackCount, onClick, onToggle }: { card: ModelCard; model?: string; status?: string; enabled: boolean; fallbackCount: number; onClick: () => void; onToggle: () => void }) {
  const Icon = card.icon;
  return (
    <div className={`agent-minimal-card agent-connection-${!enabled ? "disabled" : status === "validated" ? "ready" : status === "failed" ? "error" : "pending"}`}>
      <button type="button" className="agent-minimal-card-main" onClick={onClick}>
      <span className="agent-minimal-icon"><Icon size={17} /></span>
      <span className="agent-minimal-copy"><strong>{card.title}</strong><small>{card.description}</small><em>{!enabled ? "Desligada — etapa em bypass" : model || "Nenhum modelo configurado"}{fallbackCount > 0 ? ` · ${fallbackCount} fallback(s)` : ""}</em></span>
      <ChevronRight size={16} />
      </button>
      <label className="agent-capability-toggle" onClick={event => event.stopPropagation()}><input type="checkbox" checked={enabled} onChange={onToggle} /><span>{enabled ? "Ligada" : "Desligada"}</span></label>
    </div>
  );
}

export function PlatformAiCanvas({ canMutate }: { canMutate: boolean }) {
  const utils = trpc.useUtils();
  const rootRef = useRef<HTMLDivElement>(null);
  const connections = trpc.platform.aiConnections.useQuery();
  const globalPrompts = trpc.platform.globalCapabilityPrompts.useQuery();
  const agentConfig = trpc.agent.config.useQuery();
  const [selected, setSelected] = useState<ModelCapability | null>(null);
  const [delivery, setDelivery] = useState<Delivery>({ debounceMs: 1500, waitMs: 650, presenceEnabled: true });
  const [form, setForm] = useState({ id: undefined as number | undefined, name: "", capability: "whatsapp_reply" as ModelCapability, baseUrl: "", model: "", apiKey: "" });
  const [globalInstruction, setGlobalInstruction] = useState("");
  const [globalPromptEnabled, setGlobalPromptEnabled] = useState(true);
  const list = (connections.data as AiConnection[] | undefined) ?? [];
  const prompts = (globalPrompts.data as GlobalCapabilityPrompt[] | undefined) ?? [];

  const saveAgentConfig = trpc.agent.save.useMutation({
    onSuccess: () => { void agentConfig.refetch(); toast.success("Configuração guardada"); },
    onError: error => toast.error(error.message),
  });
  const testConnection = trpc.platform.testAiConnection.useMutation({
    onSuccess: result => {
      void utils.platform.aiConnections.invalidate();
      if (result.ready) toast.success(`Conexão validada · ${result.latencyMs} ms`);
      else toast.error(result.message);
    },
    onError: error => toast.error(`Falha no teste da conexão: ${error.message}`),
  });
  const create = trpc.platform.createAiConnection.useMutation({
    onSuccess: connection => {
      setSelected(null);
      setForm({ id: undefined, name: "", capability: "whatsapp_reply", baseUrl: "", model: "", apiKey: "" });
      void utils.platform.aiConnections.invalidate();
      toast.success("Modelo guardado; testando conexão…");
      testConnection.mutate({ id: connection.id });
    },
    onError: error => toast.error(error.message),
  });
  const update = trpc.platform.updateAiConnection.useMutation({
    onSuccess: connection => {
      setSelected(null);
      setForm({ id: undefined, name: "", capability: "whatsapp_reply", baseUrl: "", model: "", apiKey: "" });
      void utils.platform.aiConnections.invalidate();
      toast.success("Modelo atualizado; testando conexão…");
      testConnection.mutate({ id: connection.id });
    },
    onError: error => toast.error(error.message),
  });
  const saveGlobalPrompt = trpc.platform.saveGlobalCapabilityPrompt.useMutation({
    onSuccess: () => { void globalPrompts.refetch(); toast.success("Prompt global da capability guardado"); },
    onError: error => toast.error(error.message),
  });
  const toggleCapability = (capability: ModelCapability) => {
    const prompt = prompts.find(item => item.capability === capability);
    if (!canMutate) return;
    saveGlobalPrompt.mutate({
      capability,
      instruction: prompt?.instruction ?? "",
      enabled: !(prompt?.enabled ?? true),
      reason: `Capability ${capability} ${prompt?.enabled === false ? "ativada" : "desativada"}`,
    });
  };

  useEffect(() => {
    const value = (agentConfig.data as { delivery?: Partial<Delivery> } | undefined)?.delivery;
    if (value) setDelivery(current => ({ ...current, ...value }));
  }, [agentConfig.data]);

  useEffect(() => {
    if (!rootRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const context = gsap.context(() => gsap.fromTo(".agent-page-reveal", { autoAlpha: 0, y: reduce ? 0 : 10 }, { autoAlpha: 1, y: 0, duration: reduce ? 0 : 0.35, stagger: reduce ? 0 : 0.04, ease: "power2.out" }), rootRef);
    return () => context.revert();
  }, []);

  const openModel = (capability: ModelCapability) => {
    const connection = list.find(item => item.capability === capability);
    setForm({ id: connection?.id, capability, name: connection?.name ?? "", baseUrl: connection?.baseUrl ?? "", model: connection?.model ?? "", apiKey: "" });
    const prompt = (globalPrompts.data as GlobalCapabilityPrompt[] | undefined)?.find(item => item.capability === capability);
    setGlobalInstruction(prompt?.instruction ?? "");
    setGlobalPromptEnabled(prompt?.enabled ?? true);
    setSelected(capability);
  };
  const saveDelivery = () => {
    if (!agentConfig.data || !canMutate) return;
    saveAgentConfig.mutate({ ...(agentConfig.data as any), model: (agentConfig.data as any).model || "gpt-5-mini", delivery });
  };
  const selectedCard = modelCards.find(card => card.capability === selected);

  return (
    <div className="agent-page agent-minimal-page" ref={rootRef}>
      <header className="agent-page-hero agent-page-reveal">
        <div><div className="agent-breadcrumb"><span className="agent-live-dot" /> IA global <ChevronRight size={13} /> Agent Hub</div><h1>Agent Hub</h1><p>Configure os modelos por função e o comportamento das mensagens enviadas.</p></div>
        <button className="agent-primary-button" type="button" onClick={saveDelivery} disabled={!canMutate || saveAgentConfig.isPending}><Save size={14} /> Guardar alterações</button>
      </header>

      <section className="agent-minimal-flow agent-page-reveal">
        <div className="agent-minimal-section-head"><div><span className="agent-overline">Fluxo fixo</span><h2>Um agente. Todas as respostas.</h2></div><span className="agent-readonly-note"><Check size={13} /> Estrutura protegida</span></div>
        <div className="agent-minimal-flow-line"><div className="agent-flow-node"><Bot size={18} /><span><strong>Agente de resposta</strong><small>Prompt global + workspace</small></span></div><span className="agent-minimal-line" /><div className="agent-flow-node"><Send size={18} /><span><strong>Saída da mensagem</strong><small>Texto, botão, lista, áudio, carrossel ou Pix</small></span></div></div>
      </section>

      <section className="agent-minimal-section agent-page-reveal">
        <div className="agent-minimal-section-head"><div><span className="agent-overline">Modelos por função</span><h2>Conexões OpenAI-compatible</h2></div><span className="agent-muted-count">{list.length} configuradas</span></div>
        <div className="agent-model-grid">{modelCards.map(card => { const connection = list.filter(item => item.capability === card.capability).sort((a, b) => String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")))[0]; const fallbackCount = list.filter(item => item.capability === card.capability).length - (connection ? 1 : 0); const enabled = prompts.find(item => item.capability === card.capability)?.enabled !== false; return <ModelCardView key={card.capability} card={card} model={connection?.model} status={connection?.status} enabled={enabled} fallbackCount={Math.max(0, fallbackCount)} onClick={() => openModel(card.capability)} onToggle={() => toggleCapability(card.capability)} />; })}</div>
      </section>

      <section className="agent-minimal-section agent-page-reveal">
        <div className="agent-minimal-section-head"><div><span className="agent-overline">Entrega</span><h2>Debounce, wait e presença</h2></div><Settings2 size={17} /></div>
        <div className="agent-delivery-summary"><div><strong>Debounce global</strong><small>Agrupa mensagens recebidas antes do agente.</small><input type="number" min="0" max="30000" step="100" value={delivery.debounceMs} onChange={event => setDelivery(current => ({ ...current, debounceMs: Number(event.target.value) }))} /><span>ms</span></div><div><strong>Presença</strong><small>Normaliza a entrega no WhatsApp.</small><label className="agent-minimal-check"><input type="checkbox" checked={delivery.presenceEnabled} onChange={event => setDelivery(current => ({ ...current, presenceEnabled: event.target.checked }))} /> composing / recording</label></div></div>
        <div className="agent-output-grid">{outputCards.map(output => { const Icon = output.icon; return <div className="agent-output-card" key={output.key}><div className="agent-output-card-head"><span className="agent-minimal-icon"><Icon size={15} /></span><span><strong>{output.title}</strong><small>{output.description}</small></span></div><label>Wait antes de enviar<input type="number" min="0" max="10000" step="50" value={delivery.waitMs} onChange={event => setDelivery(current => ({ ...current, waitMs: Number(event.target.value) }))} /><span>ms</span></label></div>; })}</div>
      </section>

      {selected && selectedCard && <div className="agent-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="agent-modal" role="dialog" aria-modal="true" aria-labelledby="agent-modal-title"><div className="agent-modal-heading"><div><span className="agent-overline">Modelo por função</span><h2 id="agent-modal-title">{selectedCard.title}</h2></div><button type="button" className="agent-close-button" onClick={() => setSelected(null)} aria-label="Fechar"><X size={16} /></button></div><p className="agent-modal-description">Esta conexão é exclusiva para {selectedCard.title.toLowerCase()}. O endpoint e o modelo podem ser alterados sem criar outro provider.</p><div className="agent-form-grid"><label>Nome da conexão<input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Modelo principal" /></label><label>Capability<input value={selectedCard.capability} readOnly /></label><label className="wide">URL do endpoint<input value={form.baseUrl} onChange={event => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.exemplo.com/v1" /></label><label>Modelo<input value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder="ID exato do modelo" /></label><label>API key<input type="password" value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} placeholder="Cole a chave; a existente é preservada" /></label><label className="wide">Prompt global desta capability<textarea value={globalInstruction} onChange={event => setGlobalInstruction(event.target.value)} rows={5} placeholder="Instrução padrão aplicada a todos os workspaces" /></label><label className="agent-minimal-check wide"><input type="checkbox" checked={globalPromptEnabled} onChange={event => setGlobalPromptEnabled(event.target.checked)} /> Aplicar este prompt global</label></div><div className="agent-modal-actions"><button className="agent-primary-button" disabled={!canMutate || create.isPending || update.isPending || !form.name || !form.baseUrl || !form.model || (!form.id && !form.apiKey)} onClick={() => form.id ? update.mutate({ id: form.id, name: form.name, capability: selected, provider: "openai_compatible", baseUrl: form.baseUrl, model: form.model, apiKey: form.apiKey || undefined, reason: `Atualização da conexão de ${selectedCard.title}` }) : create.mutate({ name: form.name, capability: selected, provider: "openai_compatible", baseUrl: form.baseUrl, model: form.model, apiKey: form.apiKey })}><Save size={14} /> {form.id ? "Atualizar modelo" : "Guardar modelo"}</button><button className="agent-secondary-button" disabled={!canMutate || saveGlobalPrompt.isPending || !globalInstruction.trim()} onClick={() => saveGlobalPrompt.mutate({ capability: selected, instruction: globalInstruction, enabled: globalPromptEnabled, reason: `Atualização do prompt global de ${selectedCard.title}` })}><FileText size={14} /> Guardar prompt global</button><button className="agent-secondary-button" type="button" onClick={() => setSelected(null)}>Cancelar</button></div></section></div>}
    </div>
  );
}
