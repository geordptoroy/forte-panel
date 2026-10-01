import { useEffect, useState } from "react";
import { Bot, CheckCircle2, Info, Save, ShieldCheck } from "lucide-react";
import PanelLayout, { SectionTitle } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";

export default function WorkspaceAgentPage() {
  const query = trpc.agent.workspaceConfig.useQuery();
  const saveMutation = trpc.agent.saveWorkspaceConfig.useMutation({
    onSuccess: result => setConfig(result),
  });
  const [config, setConfig] = useState({
    enabled: false,
    systemPrompt: "",
    maxSteps: 6,
  });

  useEffect(() => {
    if (query.data) setConfig(query.data);
  }, [query.data]);

  if (query.isLoading)
    return (
      <PanelLayout
        eyebrow="Sistema / Inteligência artificial"
        title="Agente de IA"
        description="Carregando a política deste workspace."
      >
        <div className="surface ai-config-section">
          Carregando configuração...
        </div>
      </PanelLayout>
    );

  return (
    <PanelLayout
      eyebrow="Sistema / Inteligência artificial"
      title="Agente de IA"
      description="Defina como o atendente deve se comportar. As chaves e os provedores ficam protegidos no Console Admin."
    >
      <section className="surface ai-config-hero">
        <div className="ai-config-hero-icon">
          <Bot size={20} />
        </div>
        <div>
          <strong>Política do workspace</strong>
          <p>
            Esta configuração vale para o atendimento da sua empresa e usa
            somente as capacidades liberadas pela plataforma.
          </p>
        </div>
        <div className="ai-config-status">
          <span className="live-dot" />
          <strong>{config.enabled ? "Ativo" : "Pausado"}</strong>
        </div>
      </section>

      <section className="surface ai-config-section">
        <SectionTitle
          eyebrow="Comportamento"
          title="Ativar o agente e definir limites"
        />
        <div className="demo-banner">
          <Info size={14} />
          <span>
            Não coloque API keys, tokens ou dados secretos no prompt. A
            moderação, os providers e o roteamento técnico são administrados
            separadamente.
          </span>
        </div>
        <label className="ai-toggle-row">
          <span>
            <strong>Permitir respostas automáticas</strong>
            <small>
              Mensagens novas poderão ser atendidas pela IA quando não houver
              controle humano.
            </small>
          </span>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={event =>
              setConfig(current => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
        </label>
        <label className="form-field" style={{ marginTop: 18 }}>
          <span>Máximo de etapas por resposta</span>
          <input
            className="input-control"
            type="number"
            min={1}
            max={8}
            value={config.maxSteps}
            onChange={event =>
              setConfig(current => ({
                ...current,
                maxSteps: Number(event.target.value),
              }))
            }
          />
          <small className="muted">
            Limite de chamadas do agente e ferramentas em uma única mensagem.
          </small>
        </label>
      </section>

      <section className="surface ai-config-section">
        <SectionTitle
          eyebrow="Instruções da empresa"
          title="Prompt do agente"
        />
        <p className="muted">
          Informe tom de voz, regras de atendimento, limites, critérios de
          handoff e como usar as informações aprovadas no onboarding.
        </p>
        <label className="form-field">
          <span>System prompt do workspace</span>
          <textarea
            className="textarea-control ai-prompt-editor"
            rows={18}
            value={config.systemPrompt}
            onChange={event =>
              setConfig(current => ({
                ...current,
                systemPrompt: event.target.value,
              }))
            }
            placeholder="Ex.: Atenda em português, seja cordial e nunca confirme preço ou horário sem consultar uma ferramenta autorizada..."
          />
        </label>
        <div className="ai-config-actions">
          <button
            className="btn-primary"
            disabled={
              saveMutation.isPending ||
              config.maxSteps < 1 ||
              config.maxSteps > 8
            }
            onClick={() => saveMutation.mutate(config)}
          >
            <Save size={14} />
            {saveMutation.isPending
              ? "Salvando..."
              : "Salvar política do agente"}
          </button>
          {saveMutation.isSuccess && (
            <span className="green">
              <CheckCircle2 size={14} /> Política salva
            </span>
          )}
          {saveMutation.error && (
            <span className="form-error">{saveMutation.error.message}</span>
          )}
        </div>
      </section>

      <section className="surface ai-config-section">
        <SectionTitle eyebrow="Governança" title="O que fica protegido" />
        <div className="demo-banner">
          <ShieldCheck size={14} />
          <span>
            Providers, API keys, moderação global, fallback técnico e modelos
            são gerenciados pela plataforma. Você controla o comportamento da
            empresa, não os segredos da infraestrutura.
          </span>
        </div>
      </section>
    </PanelLayout>
  );
}
