import { useEffect, useState } from "react";
import { CheckCircle2, Info, ListChecks, Save, Sparkles } from "lucide-react";
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

export default function OnboardingPage() {
  const utils = trpc.useUtils();
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
    },
    onError: () => setAutosaveState("error"),
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
          <small className="muted" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            {autosaveState === "waiting" && "Alterações pendentes..."}
            {autosaveState === "saving" && "Salvando rascunho..."}
            {autosaveState === "saved" && "Rascunho salvo"}
            {autosaveState === "error" && "Autosave indisponível; use Salvar rascunho."}
          </small>
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
