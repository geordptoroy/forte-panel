import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Info,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import PanelLayout, { SectionTitle } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";

export default function WorkspaceAgentPage() {
  const query = trpc.agent.workspaceConfig.useQuery();
  const metricsQuery = trpc.agent.metrics.useQuery({ windowDays: 30 });
  const killSwitchQuery = trpc.agent.killSwitch.useQuery();
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
        <SectionTitle eyebrow="Saúde operacional · últimos 30 dias" title="Decisões do agente" />
        {metricsQuery.isLoading ? (
          <p className="muted">Consultando execuções deste workspace...</p>
        ) : metricsQuery.error ? (
          <p className="form-error">Não foi possível consultar a saúde do agente.</p>
        ) : (
          <>
            <div className="stat-grid agent-health-grid">
              <div className="surface stat-card"><span className="stat-label">Execuções</span><strong className="stat-value">{metricsQuery.data?.runs ?? 0}</strong><span className="stat-foot">Mensagens processadas</span></div>
              <div className="surface stat-card"><span className="stat-label">Resolvidas</span><strong className="stat-value">{Math.round((metricsQuery.data?.resolutionRate ?? 0) * 100)}%</strong><span className="stat-foot">Taxa de resolução</span></div>
              <div className="surface stat-card"><span className="stat-label">Fallbacks</span><strong className="stat-value">{metricsQuery.data?.fallbackRuns ?? 0}</strong><span className="stat-foot">Recuperações técnicas</span></div>
              <div className="surface stat-card"><span className="stat-label">Falhas</span><strong className="stat-value">{metricsQuery.data?.failed ?? 0}</strong><span className="stat-foot">Requerem acompanhamento</span></div>
            </div>
            <div className="agent-health-status">
              {killSwitchQuery.data?.paused ? <AlertTriangle size={14} /> : <ShieldCheck size={14} />}
              <span><strong>{killSwitchQuery.data?.paused ? "Execução pausada" : "Execução liberada"}</strong><small>{killSwitchQuery.data?.paused ? "O kill switch está ativo para este workspace." : "Sem pausa operacional registrada para este workspace."}</small></span>
            </div>
            <div className="agent-health-columns">
              <div>
                <div className="agent-health-heading"><strong>Por capability</strong><small>Sem nomes de provider ou conteúdo</small></div>
                <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Capability</th><th>Execuções</th><th>Fallbacks</th><th>Falhas</th></tr></thead><tbody>
                  {(metricsQuery.data?.capabilities ?? []).map(item => <tr key={item.capability}><td>{item.capability}</td><td>{item.runs}</td><td>{item.fallbackRuns}</td><td>{item.failed}</td></tr>)}
                  {(metricsQuery.data?.capabilities ?? []).length === 0 && <tr><td colSpan={4}>Nenhuma execução no período.</td></tr>}
                </tbody></table></div>
              </div>
              <div>
                <div className="agent-health-heading"><strong>Incidentes recorrentes</strong><small>Códigos técnicos resumidos</small></div>
                <div className="agent-failure-list">
                  {(metricsQuery.data?.failures ?? []).map(item => <div className="agent-failure-row" key={item.failureCode}><span>{item.failureCode}</span><strong>{item.occurrences}</strong></div>)}
                  {(metricsQuery.data?.failures ?? []).length === 0 && <div className="agent-empty-state"><RotateCcw size={13} /> Nenhuma falha registrada.</div>}
                </div>
              </div>
            </div>
          </>
        )}
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
