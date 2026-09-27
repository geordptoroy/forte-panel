import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, ListChecks, Save, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
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

const requiredStepKeys = ["identity", "offering", "operations", "guardrails"] as const;
const stepTitles: Record<string, string> = {
  identity: "Identidade da empresa",
  offering: "Oferta e serviços",
  operations: "Área e horários",
  guardrails: "Limites do atendimento",
  voice: "Tom e respostas aprovadas",
};
const fieldTitles: Record<string, string> = {
  businessName: "Nome",
  segment: "Segmento",
  description: "Descrição",
  services: "Serviços",
  serviceArea: "Área de atendimento",
  businessHours: "Horários",
  forbiddenWords: "Condutas proibidas",
  humanHandoffRules: "Transferência para humano",
  toneOfVoice: "Tom de voz",
  faq: "FAQ",
  cancellationPolicy: "Cancelamento",
  qualificationRules: "Qualificação",
};

export default function OnboardingPage() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const sessionQuery = trpc.onboarding.session.useQuery();
  const sessionStarted = useRef(false);
  const startSession = trpc.onboarding.start.useMutation({
    onSuccess: () => void sessionQuery.refetch(),
  });
  const deferSession = trpc.onboarding.defer.useMutation({
    onSuccess: () => setLocation("/dashboard"),
  });
  const profileQuery = trpc.onboarding.profile.useQuery();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [published, setPublished] = useState(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [autosaveState, setAutosaveState] = useState<"idle" | "waiting" | "saving" | "saved" | "error">("idle");
  const autosave = trpc.onboarding.autosave.useMutation({
    onSuccess: () => {
      setDirty(false);
      setAutosaveState("saved");
      void utils.onboarding.profile.invalidate();
    },
    onError: () => setAutosaveState("error"),
  });
  const confirmStep = trpc.onboarding.confirmStep.useMutation({
    onSuccess: () => void utils.onboarding.profile.invalidate(),
  });
  const saveMutation = trpc.onboarding.save.useMutation({
    onSuccess: result => {
      setPublished(result.published);
      setSavedVersion(result.version);
      setDirty(false);
      setAutosaveState("saved");
      void utils.onboarding.profile.invalidate();
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      setProfile(profileQuery.data.profile);
      setPublished(profileQuery.data.published);
      setSavedVersion(profileQuery.data.version);
      setDirty(false);
      setAutosaveState("idle");
    }
  }, [profileQuery.data]);

  useEffect(() => {
    if (sessionQuery.isLoading || sessionStarted.current) return;
    if (!sessionQuery.data || sessionQuery.data.status === "paused") {
      sessionStarted.current = true;
      startSession.mutate();
    }
  }, [sessionQuery.data, sessionQuery.isLoading, startSession.mutate]);

  useEffect(() => {
    if (!dirty) return;
    setAutosaveState("waiting");
    const timeout = window.setTimeout(() => {
      setAutosaveState("saving");
      autosave.mutate({ profile });
    }, 1200);
    return () => window.clearTimeout(timeout);
  }, [autosave.mutate, dirty, profile]);

  const update = (key: keyof Profile, value: string) => {
    setDirty(true);
    setProfile(current => ({ ...current, [key]: value }));
  };
  const confirmedStepKeys = new Set(
    (profileQuery.data?.stepAnswers ?? [])
      .filter(answer => answer.status === "confirmed")
      .map(answer => answer.stepKey)
  );
  const readyForHumanApprovedPublish =
    profileQuery.data?.checklist.readyToPublish === true &&
    requiredStepKeys.every(stepKey => confirmedStepKeys.has(stepKey));
  const confirmedRequiredCount = requiredStepKeys.filter(stepKey => confirmedStepKeys.has(stepKey)).length;
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

  return (
    <PanelLayout
      eyebrow="Sistema / Configuração"
      title="Configuração da empresa"
      description="Defina a identidade, as regras e o prompt operacional do atendimento. A configuração da IA fica em uma tela separada."
    >
      <div className="surface" style={{ padding: 18, marginBottom: 18 }}>
        <div className="demo-banner" style={{ margin: 0 }}>
          <Info size={15} />
          <span>
            O perfil estruturado é a fonte de verdade. Salvar rascunho não
            altera o agente; publicar cria uma nova versão operacional.
          </span>
        </div>
        {sessionQuery.data?.status === "paused" && (
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 11 }}>
            Retomando o rascunho salvo anteriormente...
          </p>
        )}
      </div>
      {profileQuery.data?.checklist && (
        <section className="surface" style={{ padding: 18, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div>
              <SectionTitle eyebrow="Próximo passo" title="Checklist da empresa" />
              <p className="muted" style={{ margin: "-5px 0 0", fontSize: 11 }}>
                {profileQuery.data.checklist.nextStep
                  ? `${profileQuery.data.checklist.nextStep.title}: ${profileQuery.data.checklist.nextStep.description}`
                  : "Configuração completa. Revise os dados antes de publicar."}
              </p>
            </div>
            <strong className="green" style={{ fontSize: 20 }}>{profileQuery.data.checklist.completionPercent}%</strong>
          </div>
          <div style={{ height: 5, margin: "15px 0", background: "rgba(255,255,255,.08)" }}>
            <div style={{ width: `${profileQuery.data.checklist.completionPercent}%`, height: "100%", background: "var(--green)", transition: "width .25s ease" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 8 }}>
            {profileQuery.data.checklist.items.map(item => (
              <div key={item.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 10px", border: "1px solid rgba(255,255,255,.07)", color: item.complete ? "var(--green)" : "#777", fontSize: 10 }}>
                {item.complete ? <CheckCircle2 size={14} /> : <ListChecks size={14} />}
                <span><strong style={{ display: "block", color: item.complete ? "#b9e4c7" : "#b0b0b0" }}>{item.title}</strong><small style={{ color: "#666" }}>{item.description}</small></span>
              </div>
            ))}
          </div>
        </section>
      )}
      {(profileQuery.data?.stepAnswers ?? []).length > 0 && (
        <section className="surface" style={{ padding: 18, marginBottom: 18 }}>
          <SectionTitle
            eyebrow="Revisão humana"
            title="Confirme cada bloco antes de publicar"
            action={<span className="muted" style={{ fontSize: 10 }}>{confirmedRequiredCount}/{requiredStepKeys.length} obrigatórios confirmados</span>}
          />
          <div style={{ display: "grid", gap: 10 }}>
            {(profileQuery.data?.stepAnswers ?? []).map(step => {
              const required = requiredStepKeys.includes(step.stepKey as (typeof requiredStepKeys)[number]);
              const confirmed = step.status === "confirmed";
              return (
                <div key={step.stepKey} style={{ padding: 12, border: `1px solid ${confirmed ? "rgba(86,214,138,.28)" : "rgba(255,255,255,.08)"}`, background: confirmed ? "rgba(86,214,138,.035)" : "rgba(255,255,255,.012)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <strong style={{ color: "#ddd", fontSize: 12 }}>{stepTitles[step.stepKey] ?? step.stepKey}</strong>
                      <div style={{ display: "grid", gap: 5, marginTop: 9 }}>
                        {Object.entries(step.answer).map(([key, value]) => (
                          <div key={key} style={{ fontSize: 10, lineHeight: 1.5 }}>
                            <span className="muted">{fieldTitles[key] ?? key}: </span><span style={{ color: "#aaa", whiteSpace: "pre-wrap" }}>{value || "Não informado"}</span>
                          </div>
                        ))}
                      </div>
                      {step.revisions.length > 0 && (
                        <details style={{ marginTop: 10 }}>
                          <summary className="muted" style={{ cursor: "pointer", fontSize: 10 }}>
                            Histórico · {step.revisions.length} {step.revisions.length === 1 ? "revisão" : "revisões"}
                          </summary>
                          <div style={{ display: "grid", gap: 5, marginTop: 7 }}>
                            {step.revisions.slice(0, 5).map((revision, index) => (
                              <div key={revision.id} className="muted" style={{ fontSize: 9 }}>
                                #{step.revisions.length - index} · {new Date(revision.createdAt).toLocaleString("pt-BR")} · {revision.status === "confirmed" ? "confirmada" : "rascunho"}{revision.changedBy ? ` · usuário ${revision.changedBy}` : ""}
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                    {(required || step.stepKey === "voice") && (
                      <button
                        className={confirmed ? "btn-secondary" : "btn-primary"}
                        disabled={confirmed || confirmStep.isPending}
                        onClick={() => confirmStep.mutate({ stepKey: step.stepKey as "identity" | "offering" | "operations" | "guardrails" | "voice" })}
                      >
                        <CheckCircle2 size={13} /> {confirmed ? "Confirmado" : required ? "Confirmar bloco" : "Confirmar opcional"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {confirmStep.error && <div className="demo-banner" style={{ margin: "12px 0 0" }}><Info size={14} /> {confirmStep.error.message}</div>}
        </section>
      )}
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
            disabled={saveMutation.isPending || !readyForHumanApprovedPublish}
            onClick={() => saveMutation.mutate({ profile, publish: true })}
            title={!readyForHumanApprovedPublish ? "Salve o rascunho e confirme os blocos obrigatórios antes de publicar" : undefined}
          >
            <Sparkles size={13} />{" "}
            {saveMutation.isPending ? "Gerando..." : readyForHumanApprovedPublish ? "Gerar e publicar prompt" : "Confirme os blocos obrigatórios"}
          </button>
          <small className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {autosaveState === "waiting" && "Alterações pendentes..."}
            {autosaveState === "saving" && "Salvando rascunho..."}
            {autosaveState === "saved" && "Rascunho salvo"}
            {autosaveState === "error" && "Autosave indisponível; use Salvar rascunho."}
          </small>
          <button
            className="btn-secondary"
            disabled={deferSession.isPending || saveMutation.isPending}
            onClick={() => deferSession.mutate()}
          >
            Fazer depois
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
