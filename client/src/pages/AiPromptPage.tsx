import { useEffect, useState } from "react";
import { CheckCircle2, Info, Save, Sparkles } from "lucide-react";
import PanelLayout, { SectionTitle } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";

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
    routing: Record<
      Capability,
      { provider: ProviderId; model: string; baseUrl?: string; apiKey?: string }
    >;
  };
};
export default function AiPromptPage() {
  const query = trpc.agent.config.useQuery();
  const saveMutation = trpc.agent.save.useMutation();
  const [config, setConfig] = useState<AgentConfig | null>(null);
  useEffect(() => {
    if (query.data) setConfig(query.data as AgentConfig);
  }, [query.data]);
  if (!config)
    return (
      <PanelLayout
        eyebrow="Sistema / Inteligência artificial"
        title="Prompt do agente"
        description="Instruções globais do agente nativo."
      >
        <div className="surface ai-config-section">
          Carregando configuração...
        </div>
      </PanelLayout>
    );
  const save = () => saveMutation.mutate(config);
  return (
    <PanelLayout
      eyebrow="Sistema / Inteligência artificial"
      title="Prompt do agente"
      description="Defina como o agente deve pensar, falar e agir. Os modelos ficam em outra tela."
    >
      <section className="surface ai-config-hero">
        <div className="ai-config-hero-icon">
          <Sparkles size={20} />
        </div>
        <div>
          <strong>Instruções globais</strong>
          <p>
            Este prompt vale para todos os canais e operações. O perfil da
            empresa continua em Configuração da empresa.
          </p>
        </div>
      </section>
      <section className="surface ai-config-section">
        <SectionTitle
          eyebrow="Prompt principal"
          title="Comportamento do agente"
        />
        <div className="demo-banner">
          <Info size={14} />
          <span>
            Escreva regras de comportamento, tom, limites, prioridades e quando
            usar ferramentas. Não coloque API keys aqui.
          </span>
        </div>
        <label className="form-field">
          <span>System prompt do agente</span>
          <textarea
            className="textarea-control ai-prompt-editor"
            rows={22}
            value={config.systemPrompt}
            onChange={event =>
              setConfig({ ...config, systemPrompt: event.target.value })
            }
            placeholder="Ex.: Você é o atendente da empresa. Seja claro, cordial e objetivo..."
          />
        </label>
        <div className="ai-config-actions">
          <button
            className="btn-primary"
            disabled={saveMutation.isPending}
            onClick={save}
          >
            <Save size={14} />
            {saveMutation.isPending ? "Salvando..." : "Salvar prompt do agente"}
          </button>
          {saveMutation.isSuccess && (
            <span className="green">
              <CheckCircle2 size={14} /> Prompt salvo
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
