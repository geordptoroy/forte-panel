import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Bot, CheckCircle2, CircleDot, KeyRound, Mic2, MoreHorizontal, ShieldCheck, Sparkles, Volume2, X } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const pipeline = [
  { id: "input", title: "Mensagem recebida", subtitle: "Baileys / WhatsApp", icon: Bot, tone: "blue", capability: "Entrada" },
  { id: "moderation", title: "Moderação", subtitle: "Modelo leve de segurança", icon: ShieldCheck, tone: "amber", capability: "Moderação" },
  { id: "text", title: "Texto principal", subtitle: "Workspace + Console", icon: Sparkles, tone: "green", capability: "Texto" },
  { id: "tools", title: "Ferramentas", subtitle: "Comandos tipados", icon: MoreHorizontal, tone: "purple", capability: "Tool calling" },
  { id: "tts", title: "Resposta por voz", subtitle: "Disponível por plano", icon: Volume2, tone: "pink", capability: "TTS" },
  { id: "output", title: "Entrega", subtitle: "Payload montado pelo backend", icon: CheckCircle2, tone: "green", capability: "Baileys" },
] as const;

type AiNodeData = { title: string; subtitle: string; capability: string; tone: string; icon: typeof Bot; active: boolean; onOpen: () => void };

type AiConnection = { id: number; name: string; baseUrl: string; model: string; capability: string; status: string; apiKey?: string };

function PipelineNode({ data }: NodeProps<Node<AiNodeData>>) {
  const Icon = data.icon;
  return (
    <button type="button" className={`platform-ai-canvas-node tone-${data.tone} ${data.active ? "is-active" : ""}`} onClick={data.onOpen}>
      <Handle type="target" position={Position.Left} className="platform-ai-handle" />
      <div className="platform-ai-node-icon"><Icon size={15} /></div>
      <div className="platform-ai-node-copy"><strong>{data.title}</strong><small>{data.subtitle}</small></div>
      <span className="platform-ai-node-status"><span />{data.capability}</span>
      <Handle type="source" position={Position.Right} className="platform-ai-handle" />
    </button>
  );
}

const nodeTypes = { pipeline: PipelineNode };

export function PlatformAiCanvas({ canMutate }: { canMutate: boolean }) {
  const utils = trpc.useUtils();
  const connections = trpc.platform.aiConnections.useQuery();
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<any>({ name: "", capability: "whatsapp_reply", baseUrl: "", model: "", apiKey: "" });
  const [reason] = useState("Remoção de conexão de IA pelo Agent Hub");
  const canvasRef = useRef<HTMLDivElement>(null);
  const create = trpc.platform.createAiConnection.useMutation({
    onSuccess: () => { setForm({ name: "", capability: "whatsapp_reply", baseUrl: "", model: "", apiKey: "" }); void utils.platform.aiConnections.invalidate(); toast.success("Conexão criada no Agent Hub"); },
    onError: error => toast.error(error.message),
  });
  const test = trpc.platform.testAiConnection.useMutation({
    onSuccess: result => { void utils.platform.aiConnections.invalidate(); result.ready ? toast.success(`${result.message} · ${result.latencyMs} ms`) : toast.error(result.message); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.platform.deleteAiConnection.useMutation({
    onSuccess: () => { void utils.platform.aiConnections.invalidate(); toast.success("Conexão excluída"); },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = gsap.context(() => { gsap.fromTo(".platform-ai-canvas-node", { autoAlpha: 0, y: reduce ? 0 : 14 }, { autoAlpha: 1, y: 0, duration: reduce ? 0 : 0.45, stagger: reduce ? 0 : 0.06, ease: "power2.out" }); }, canvasRef);
    return () => ctx.revert();
  }, []);

  const openNode = (id: string) => {
    setSelected(id);
    const connection = (connections.data as AiConnection[] | undefined)?.find(item => item.capability === (id === "moderation" ? "moderation" : id === "tts" ? "tts" : "whatsapp_reply"));
    setForm({ name: connection?.name ?? "", capability: connection?.capability ?? "whatsapp_reply", baseUrl: connection?.baseUrl ?? "", model: connection?.model ?? "", apiKey: "" });
  };

  const nodes = useMemo<Node<AiNodeData>[]>(() => pipeline.map((item, index) => ({ id: item.id, type: "pipeline", position: { x: index * 245, y: 100 }, data: { ...item, active: selected === item.id, onOpen: () => openNode(item.id) } })), [selected, connections.data]);
  const edges = useMemo<Edge[]>(() => pipeline.slice(1).map((item, index) => ({ id: `${pipeline[index].id}-${item.id}`, source: pipeline[index].id, target: item.id, animated: true, style: { stroke: "rgba(111, 224, 156, .34)", strokeWidth: 1.5 } })), []);
  const activeConnection = (connections.data as AiConnection[] | undefined)?.find(item => item.capability === form.capability);

  return (
    <div className="platform-ai-hub" ref={canvasRef}>
      <section className="platform-card platform-ai-canvas-card">
        <div className="platform-card-title"><div><span className="eyebrow">Canvas operacional</span><h2>Fluxo visual do Agent Hub</h2></div><span className="platform-ai-canvas-hint"><CircleDot size={13} /> Clique num node para configurar</span></div>
        <p className="platform-muted">Os nodes são uma visualização do pipeline. O modelo escolhe a intenção; o backend valida o comando e monta o payload final Baileys.</p>
        <div className="platform-ai-canvas-wrap">
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }} nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }}>
            <Background color="rgba(255,255,255,.06)" gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={node => node.data?.tone === "amber" ? "#d9a441" : "#58d98d"} pannable zoomable />
          </ReactFlow>
        </div>
      </section>

      <section className="platform-card">
        <div className="platform-card-title"><div><span className="eyebrow">Conexões</span><h2>Modelos e capacidades</h2></div><KeyRound size={18} /></div>
        <div className="platform-ai-connection-grid">
          {(connections.data as AiConnection[] | undefined)?.map(connection => <article className="platform-ai-connection" key={connection.id}><div className="platform-ai-connection-top"><strong>{connection.name}</strong><span className={`platform-status ${connection.status === "validated" ? "green" : "amber"}`}><span />{connection.status === "validated" ? "Validada" : "Pendente"}</span></div><small>{connection.capability} · {connection.model}</small><code>{connection.baseUrl}</code><div className="platform-form-actions"><button className="btn-secondary" disabled={!canMutate || test.isPending} onClick={() => test.mutate({ id: connection.id })}>Testar</button><button className="btn-secondary" disabled={!canMutate || remove.isPending} onClick={() => { if (window.confirm(`Excluir a conexão ${connection.name}?`)) remove.mutate({ id: connection.id, reason }); }}>Excluir</button></div></article>)}
          {(!connections.data || connections.data.length === 0) && <p className="platform-muted">Nenhuma conexão cadastrada. Clique num node para adicionar a primeira.</p>}
        </div>
      </section>

      {selected && <div className="platform-ai-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="platform-ai-modal" role="dialog" aria-modal="true" aria-labelledby="ai-node-title"><div className="platform-card-title"><div><span className="eyebrow">Configurar node</span><h2 id="ai-node-title">{pipeline.find(item => item.id === selected)?.title}</h2></div><button className="btn-icon" type="button" onClick={() => setSelected(null)} aria-label="Fechar"><X size={16} /></button></div><p className="platform-muted">Configure uma conexão genérica por URL e chave. O provider é detectado internamente quando possível.</p><div className="platform-form-grid"><label className="platform-field"><span>Nome da conexão</span><input className="input-control" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="Ex.: Moderação rápida" /></label><label className="platform-field"><span>Capacidade</span><select className="select-control" value={form.capability} onChange={event => setForm({ ...form, capability: event.target.value })}><option value="whatsapp_reply">Texto / agente</option><option value="moderation">Moderação</option><option value="tts">TTS / resposta por voz</option><option value="prompt_generation">Geração de prompts</option><option value="audio_transcription">Transcrição de áudio</option><option value="image_analysis">Visão</option></select></label><label className="platform-field full"><span>URL do endpoint</span><input className="input-control" value={form.baseUrl} onChange={event => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://api.exemplo.com/v1" /></label><label className="platform-field"><span>Modelo</span><input className="input-control" value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} placeholder="ID detectado ou manual" /></label><label className="platform-field"><span>API key</span><input className="input-control" type="password" value={form.apiKey} onChange={event => setForm({ ...form, apiKey: event.target.value })} placeholder={activeConnection ? "Chave preservada; deixe vazio" : "Cole a chave aqui"} /></label></div><div className="platform-form-actions"><button className="btn-primary" disabled={!canMutate || create.isPending || !form.name || !form.baseUrl || !form.model || (!activeConnection && !form.apiKey)} onClick={() => create.mutate({ ...form, provider: "openai_compatible" as const })}><KeyRound size={14} /> {create.isPending ? "Guardando…" : "Guardar conexão"}</button><button className="btn-secondary" type="button" onClick={() => setSelected(null)}>Cancelar</button>{!canMutate && <small className="platform-muted">Acesso somente leitura.</small>}</div></section></div>}
    </div>
  );
}
