import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Info,
  ListChecks,
  Loader2,
  Mic,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  UploadCloud,
  Volume2,
} from "lucide-react";
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

type CatalogService = {
  id: number;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  professionalIds: number[];
};

type CatalogProfessional = {
  id: number;
  name: string;
  specialty: string | null;
  color: string;
  active: boolean;
  serviceIds: number[];
  availability: { weekday: number; startMinute: number; endMinute: number }[];
};

const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parsePriceCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0;
}

function formatMinute(minute: number) {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

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

const voiceStepKeys = ["identity", "offering", "operations", "guardrails", "voice"] as const;
type VoiceStepKey = (typeof voiceStepKeys)[number];

function formatRecordingDuration(durationMs: number) {
  const seconds = Math.floor(durationMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");
      if (separator < 0) {
        reject(new Error("Não foi possível preparar o áudio para envio."));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler a gravação."));
    reader.readAsDataURL(blob);
  });
}

export default function OnboardingPage() {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const sessionQuery = trpc.onboarding.session.useQuery();
  const sessionStarted = useRef(false);
  const startSession = trpc.onboarding.start.useMutation({
    onSuccess: () => void sessionQuery.refetch(),
  });
  const governanceQuery = trpc.onboarding.governance.useQuery();
  const [retention, setRetention] = useState({ rawArtifactDays: 30, derivedDataDays: 180 });
  const setSourceConsent = trpc.onboarding.setSourceConsent.useMutation({
    onSuccess: () => void governanceQuery.refetch(),
  });
  const saveRetentionPolicy = trpc.onboarding.saveRetentionPolicy.useMutation({
    onSuccess: () => void governanceQuery.refetch(),
  });
  const deferSession = trpc.onboarding.defer.useMutation({
    onSuccess: () => setLocation("/dashboard"),
  });
  const profileQuery = trpc.onboarding.profile.useQuery();
  const servicesQuery = trpc.workspace.services.useQuery();
  const professionalsQuery = trpc.workspace.professionalsDetailed.useQuery();
  const createService = trpc.workspace.createService.useMutation({
    onSuccess: () => void servicesQuery.refetch(),
  });
  const updateService = trpc.workspace.updateService.useMutation({
    onSuccess: () => void servicesQuery.refetch(),
  });
  const setServiceProfessionals = trpc.workspace.setServiceProfessionals.useMutation({
    onSuccess: () => {
      void servicesQuery.refetch();
      void professionalsQuery.refetch();
    },
  });
  const createProfessional = trpc.workspace.createProfessional.useMutation({
    onSuccess: () => void professionalsQuery.refetch(),
  });
  const setProfessionalAvailability = trpc.workspace.setProfessionalAvailability.useMutation({
    onSuccess: () => void professionalsQuery.refetch(),
  });
  const metricsQuery = trpc.onboarding.metrics.useQuery({ windowDays: 30 });
  const versionsQuery = trpc.onboarding.versions.useQuery();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [newService, setNewService] = useState({ name: "", price: "", durationMinutes: 60 });
  const [newProfessionalName, setNewProfessionalName] = useState("");
  const [catalogMessage, setCatalogMessage] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
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
  const resolveConflict = trpc.onboarding.resolveConflict.useMutation({
    onSuccess: () => void utils.onboarding.profile.invalidate(),
  });
  const answerFollowUp = trpc.onboarding.answerFollowUp.useMutation({
    onSuccess: () => void utils.onboarding.profile.invalidate(),
  });
  const answerConflict = trpc.onboarding.answerConflict.useMutation({
    onSuccess: () => void utils.onboarding.profile.invalidate(),
  });
  const saveMutation = trpc.onboarding.save.useMutation({
    onSuccess: result => {
      setPublished(result.published);
      setSavedVersion(result.version);
      setDirty(false);
      setAutosaveState("saved");
      void utils.onboarding.profile.invalidate();
      void utils.onboarding.versions.invalidate();
    },
  });
  const [simulationMessage, setSimulationMessage] = useState("");
  const simulation = trpc.onboarding.simulate.useMutation();
  const rollbackMutation = trpc.onboarding.rollback.useMutation({
    onSuccess: result => {
      setPublished(true);
      setSavedVersion(result.version);
      void utils.onboarding.profile.invalidate();
      void utils.onboarding.versions.invalidate();
    },
  });
  const [voiceStepKey, setVoiceStepKey] = useState<VoiceStepKey>("voice");
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "recording" | "recorded" | "uploading" | "transcribing" | "completed" | "error">("idle");
  const [voiceDurationMs, setVoiceDurationMs] = useState(0);
  const [voiceMimeType, setVoiceMimeType] = useState("audio/webm");
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [voiceCorrectionMode, setVoiceCorrectionMode] = useState(false);
  const [proposalMessage, setProposalMessage] = useState("");
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<string, string>>({});
  const onboardingSteps = [
    { id: "identity", title: "Negócio", description: "Identidade e posicionamento" },
    { id: "offering", title: "Serviços", description: "Oferta, preços e duração" },
    { id: "operations", title: "Operação", description: "Área, horários e capacidade" },
    { id: "guardrails", title: "Atendimento", description: "Tom, triagem e limites" },
    { id: "review", title: "Revisão", description: "Resumo e confirmação" },
    { id: "activation", title: "Ativação", description: "Publicar e conectar canal" },
  ] as const;
  const currentStepId = onboardingSteps[currentStep]?.id ?? "identity";
  const goToNextStep = () => setCurrentStep(step => Math.min(onboardingSteps.length - 1, step + 1));
  const goToPreviousStep = () => setCurrentStep(step => Math.max(0, step - 1));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const recordingTimerRef = useRef<number | null>(null);
  const transcribeVoice = trpc.voice.transcribe.useMutation({
    onSuccess: result => {
      setVoiceStatus("completed");
      setVoiceTranscript(result.text);
      setVoiceError("");
    },
    onError: error => {
      setVoiceStatus("error");
      setVoiceError(error.message);
    },
  });
  const uploadVoice = trpc.voice.upload.useMutation({
    onSuccess: asset => {
      setVoiceStatus("transcribing");
      transcribeVoice.mutate({ assetId: asset.assetId, language: "pt" });
    },
    onError: error => {
      setVoiceStatus("error");
      setVoiceError(error.message);
    },
  });
  const extractProposal = trpc.onboarding.extractProposal.useMutation({
    onSuccess: result => {
      setProposalMessage(`Rascunho estruturado salvo com ${result.confidence}% de confiança. Revise o bloco antes de confirmar.`);
      void utils.onboarding.profile.invalidate();
    },
    onError: error => setProposalMessage(error.message),
  });
  const followUpDraft = (key: string) => followUpDrafts[key] ?? "";
  const setFollowUpDraft = (key: string, value: string) =>
    setFollowUpDrafts(current => ({ ...current, [key]: value }));

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
    if (governanceQuery.data?.retention) {
      setRetention({
        rawArtifactDays: governanceQuery.data.retention.rawArtifactDays,
        derivedDataDays: governanceQuery.data.retention.derivedDataDays,
      });
    }
  }, [governanceQuery.data]);

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

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
  }, [voiceUrl]);

  const stopRecording = () => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecording = async (correction = voiceCorrectionMode) => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setVoiceStatus("error");
      setVoiceError("Este navegador não oferece gravação de áudio. Responda por texto ou use um navegador atualizado.");
      return;
    }
    setVoiceError("");
    setVoiceTranscript("");
    setProposalMessage("");
    setVoiceCorrectionMode(correction);
    setVoiceBlob(null);
    if (voiceUrl) {
      URL.revokeObjectURL(voiceUrl);
      setVoiceUrl("");
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
      const supported = candidates.find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : undefined);
      streamRef.current = stream;
      recorderRef.current = recorder;
      voiceChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      setVoiceDurationMs(0);
      setVoiceMimeType((supported ?? "audio/webm").split(";", 1)[0]);
      setVoiceStatus("recording");
      recorder.ondataavailable = event => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        if (recordingTimerRef.current) window.clearInterval(recordingTimerRef.current);
        stream.getTracks().forEach(track => track.stop());
        const durationMs = Math.min(correction ? 30_000 : 120_000, Date.now() - recordingStartedAtRef.current);
        const mimeType = (recorder.mimeType || supported || "audio/webm").split(";", 1)[0];
        const blob = new Blob(voiceChunksRef.current, { type: mimeType });
        setVoiceDurationMs(durationMs);
        setVoiceMimeType(mimeType);
        setVoiceBlob(blob);
        setVoiceStatus(blob.size > 0 && blob.size <= 16 * 1024 * 1024 ? "recorded" : "error");
        if (!blob.size) setVoiceError("A gravação ficou vazia. Tente novamente.");
        if (blob.size > 16 * 1024 * 1024) setVoiceError("A gravação ultrapassou o limite de 16 MB.");
        if (blob.size > 0 && blob.size <= 16 * 1024 * 1024) setVoiceUrl(URL.createObjectURL(blob));
        streamRef.current = null;
        recorderRef.current = null;
      };
      recorder.start(250);
      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - recordingStartedAtRef.current;
        setVoiceDurationMs(Math.min(correction ? 30_000 : 120_000, elapsed));
        if (elapsed >= (correction ? 30_000 : 120_000)) stopRecording();
      }, 250);
    } catch {
      setVoiceStatus("error");
      setVoiceError("Não foi possível acessar o microfone. Verifique a permissão do navegador ou responda por texto.");
    }
  };

  const discardRecording = () => {
    stopRecording();
    if (voiceUrl) URL.revokeObjectURL(voiceUrl);
    setVoiceUrl("");
    setVoiceBlob(null);
    setVoiceTranscript("");
    setVoiceError("");
    setVoiceDurationMs(0);
    setVoiceCorrectionMode(false);
    setProposalMessage("");
    setVoiceStatus("idle");
  };

  const uploadRecordedVoice = async () => {
    if (!voiceBlob || !sessionQuery.data?.id) return;
    setVoiceStatus("uploading");
    setVoiceError("");
    try {
      const audioBase64 = await blobToBase64(voiceBlob);
      uploadVoice.mutate({
        sessionId: sessionQuery.data.id,
        stepKey: voiceStepKey,
        mimeType: voiceMimeType,
        durationMs: Math.max(1, Math.round(voiceDurationMs)),
        correction: voiceCorrectionMode,
        audioBase64,
      });
    } catch (error) {
      setVoiceStatus("error");
      setVoiceError(error instanceof Error ? error.message : "Não foi possível preparar o áudio.");
    }
  };

  const extractStructuredProposal = () => {
    if (!voiceTranscript.trim()) return;
    setProposalMessage("");
    extractProposal.mutate({
      stepKey: voiceStepKey,
      text: voiceTranscript.trim(),
      language: "pt-BR",
    });
  };

  const insertTranscriptIntoFaq = () => {
    if (!voiceTranscript.trim()) return;
    const prefix = profile.faq.trim() ? `${profile.faq.trim()}\n\n` : "";
    setDirty(true);
    setProfile(current => ({
      ...current,
      faq: `${prefix}Transcrição do onboarding (${stepTitles[voiceStepKey]}):\n${voiceTranscript.trim()}`,
    }));
  };

  const update = (key: keyof Profile, value: string) => {
    setDirty(true);
    setProfile(current => ({ ...current, [key]: value }));
  };
  const addService = () => {
    if (!newService.name.trim()) return;
    setCatalogMessage("");
    createService.mutate({
      name: newService.name.trim(),
      durationMinutes: newService.durationMinutes,
      priceCents: parsePriceCents(newService.price),
    }, {
      onSuccess: () => setNewService({ name: "", price: "", durationMinutes: 60 }),
      onError: error => setCatalogMessage(error.message),
    });
  };
  const addProfessional = () => {
    if (!newProfessionalName.trim()) return;
    setCatalogMessage("");
    createProfessional.mutate({ name: newProfessionalName.trim() }, {
      onSuccess: () => setNewProfessionalName(""),
      onError: error => setCatalogMessage(error.message),
    });
  };
  const toggleWeekday = (professional: CatalogProfessional, weekday: number) => {
    const current = professional.availability;
    const existing = current.find(entry => entry.weekday === weekday);
    const next = existing
      ? current.filter(entry => entry.weekday !== weekday)
      : [...current, { weekday, startMinute: 9 * 60, endMinute: 18 * 60 }];
    setProfessionalAvailability.mutate({ professionalId: professional.id, entries: next });
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
  const transcriptionConsentGranted = governanceQuery.data?.consents.some(
    consent => consent.source === "transcription" && consent.status === "granted"
  ) === true;
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
      description="Configure o essencial em seis passos. Você pode salvar, corrigir e continuar depois sem conhecer detalhes técnicos de IA."
    >
      <section className="surface" data-step={currentStepId} style={{ padding: 18, marginBottom: 18 }} aria-label="Progresso da configuração">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div className="muted" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>Passo {currentStep + 1} de {onboardingSteps.length}</div>
            <h2 style={{ margin: "5px 0 3px", fontSize: 18 }}>{onboardingSteps[currentStep]?.title}</h2>
            <p className="muted" style={{ margin: 0, fontSize: 11 }}>{onboardingSteps[currentStep]?.description}. Responda por texto; áudio é opcional.</p>
          </div>
          <strong className="green" style={{ fontSize: 20 }}>{Math.round(((currentStep + 1) / onboardingSteps.length) * 100)}%</strong>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${onboardingSteps.length}, minmax(0, 1fr))`, gap: 5, marginBottom: 14 }}>
          {onboardingSteps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={index === currentStep ? "btn-primary" : index < currentStep ? "btn-secondary" : "btn-ghost"}
              style={{ minWidth: 0, padding: "8px 5px", fontSize: 9 }}
              onClick={() => setCurrentStep(index)}
              aria-current={index === currentStep ? "step" : undefined}
            >{index + 1}. {step.title}</button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 10 }}>O rascunho é salvo automaticamente.</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={goToPreviousStep} disabled={currentStep === 0}>Voltar</button>
            <button type="button" className="btn-primary" onClick={goToNextStep} disabled={currentStep === onboardingSteps.length - 1}>Próximo</button>
          </div>
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
        {sessionQuery.data?.status === "paused" && (
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 11 }}>
            Retomando o rascunho salvo anteriormente...
          </p>
        )}
      </div>
      {governanceQuery.data && (
        <section className="surface" style={{ padding: 18, marginBottom: 18, display: currentStepId === "activation" ? undefined : "none" }}>
          <SectionTitle eyebrow="Governança" title="Consentimento e retenção" />
          <p className="muted" style={{ margin: "-5px 0 14px", fontSize: 11 }}>
            Fontes automáticas só poderão ser conectadas com consentimento vigente. Política {governanceQuery.data.policyVersion}.
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {governanceQuery.data.consents.map(consent => (
              <div key={consent.source} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "9px 10px", border: "1px solid rgba(255,255,255,.07)" }}>
                <div>
                  <strong style={{ color: "#ddd", fontSize: 11 }}>{consent.source === "llm" ? "Processamento por LLM" : "Transcrição de áudio"}</strong>
                  <div className="muted" style={{ fontSize: 10, marginTop: 3 }}>{consent.status === "granted" ? "Consentimento ativo" : "Não autorizado"}</div>
                </div>
                <button
                  className={consent.status === "granted" ? "btn-secondary" : "btn-primary"}
                  disabled={setSourceConsent.isPending}
                  onClick={() => setSourceConsent.mutate({ source: consent.source, granted: consent.status !== "granted", policyVersion: governanceQuery.data.policyVersion })}
                >{consent.status === "granted" ? "Revogar" : "Conceder consentimento"}</button>
              </div>
            ))}
          </div>
          <div className="form-grid" style={{ marginTop: 14 }}>
            <div className="form-field">
              <label htmlFor="onboarding-raw-retention">Dados brutos (dias)</label>
              <input id="onboarding-raw-retention" className="input-control" type="number" min={1} max={90} value={retention.rawArtifactDays} onChange={event => setRetention(current => ({ ...current, rawArtifactDays: Number(event.target.value) }))} />
            </div>
            <div className="form-field">
              <label htmlFor="onboarding-derived-retention">Dados derivados (dias)</label>
              <input id="onboarding-derived-retention" className="input-control" type="number" min={30} max={3650} value={retention.derivedDataDays} onChange={event => setRetention(current => ({ ...current, derivedDataDays: Number(event.target.value) }))} />
            </div>
          </div>
          <button
            className="btn-secondary"
            style={{ marginTop: 12 }}
            disabled={saveRetentionPolicy.isPending}
            onClick={() => saveRetentionPolicy.mutate({ ...retention, policyVersion: governanceQuery.data.policyVersion })}
          >Salvar política de retenção</button>
          {(setSourceConsent.error || saveRetentionPolicy.error) && <div className="demo-banner" style={{ margin: "12px 0 0" }}><Info size={14} /> {(setSourceConsent.error || saveRetentionPolicy.error)?.message}</div>}
        </section>
      )}
      <section className="surface" style={{ padding: 18, marginBottom: 18, display: currentStepId === "review" ? undefined : "none" }}>
        <SectionTitle
          eyebrow="Entrada por voz"
          title="Responda falando, revise antes de usar"
          action={<span className="muted" style={{ fontSize: 10 }}>{voiceCorrectionMode ? "correção curta · 00:30" : "até 02:00 · 16 MB"}</span>}
        />
        <p className="muted" style={{ margin: "-5px 0 14px", fontSize: 11, lineHeight: 1.5 }}>
          Grave uma resposta curta para este bloco. O áudio será enviado de forma privada, transcrito e mostrado como rascunho; nada publica automaticamente.
        </p>
        <div className="form-grid" style={{ alignItems: "end" }}>
          <div className="form-field">
            <label htmlFor="onboarding-voice-step">Bloco da resposta</label>
            <select
              id="onboarding-voice-step"
              className="input-control"
              value={voiceStepKey}
              onChange={event => setVoiceStepKey(event.target.value as VoiceStepKey)}
              disabled={voiceStatus === "recording" || voiceStatus === "uploading" || voiceStatus === "transcribing"}
            >
              {voiceStepKeys.map(stepKey => <option key={stepKey} value={stepKey}>{stepTitles[stepKey]}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className={voiceStatus === "recording" ? "btn-secondary" : "btn-primary"}
              disabled={!transcriptionConsentGranted || !sessionQuery.data?.id || voiceStatus === "uploading" || voiceStatus === "transcribing"}
              onClick={() => voiceStatus === "recording" ? stopRecording() : void startRecording(false)}
              title={!transcriptionConsentGranted ? "Conceda o consentimento de transcrição acima antes de gravar" : undefined}
            >
              {voiceStatus === "recording" ? <><Square size={13} /> Parar gravação</> : <><Mic size={13} /> Gravar resposta</>}
            </button>
            {voiceTranscript && voiceStatus === "completed" && (
              <button className="btn-secondary" onClick={() => void startRecording(true)} disabled={!transcriptionConsentGranted}>
                <Mic size={13} /> Regravar correção curta
              </button>
            )}
            {voiceBlob && voiceStatus !== "recording" && (
              <button className="btn-secondary" onClick={discardRecording} disabled={voiceStatus === "uploading" || voiceStatus === "transcribing"}>
                <RotateCcw size={13} /> Gravar novamente
              </button>
            )}
          </div>
        </div>
        {!transcriptionConsentGranted && (
          <div className="demo-banner" style={{ margin: "14px 0 0" }}>
            <Info size={14} /> Conceda o consentimento de transcrição na seção de governança para habilitar o microfone.
          </div>
        )}
        {voiceStatus === "recording" && (
          <div className="operational-banner" style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 14, padding: "10px 12px", fontSize: 10 }} aria-live="polite">
            <Volume2 size={14} /> Gravando {formatRecordingDuration(voiceDurationMs)} de {voiceCorrectionMode ? "00:30" : "02:00"}. Fale naturalmente e pare quando terminar.
          </div>
        )}
        {voiceUrl && (
          <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
            <audio controls src={voiceUrl} style={{ width: "100%", height: 36 }} aria-label="Prévia da gravação" />
            {voiceStatus === "recorded" || voiceStatus === "error" ? (
              <button className="btn-secondary" onClick={() => void uploadRecordedVoice()} disabled={uploadVoice.isPending || transcribeVoice.isPending}>
                <UploadCloud size={13} /> Enviar e transcrever
              </button>
            ) : null}
          </div>
        )}
        {(voiceStatus === "uploading" || voiceStatus === "transcribing") && (
          <div className="muted" style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 10 }} aria-live="polite">
            <Loader2 size={13} className="animate-spin" /> {voiceStatus === "uploading" ? "Enviando áudio privado..." : "Transcrevendo com consentimento..."}
          </div>
        )}
        {voiceTranscript && voiceStatus === "completed" && (
          <div style={{ marginTop: 14, padding: 12, border: "1px solid rgba(86,214,138,.22)", background: "rgba(86,214,138,.035)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <strong style={{ color: "#b9e4c7", fontSize: 11 }}>Transcrição revisável</strong>
              <button className="btn-secondary" style={{ padding: "5px 8px", fontSize: 9 }} onClick={insertTranscriptIntoFaq}>
                Usar no FAQ como rascunho
              </button>
            </div>
            <textarea
              className="input-control"
              value={voiceTranscript}
              onChange={event => setVoiceTranscript(event.target.value)}
              rows={5}
              aria-label="Transcrição corrigível"
              style={{ marginTop: 9, minHeight: 100, resize: "vertical", lineHeight: 1.55 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
              <button className="btn-primary" onClick={extractStructuredProposal} disabled={!voiceTranscript.trim() || extractProposal.isPending}>
                {extractProposal.isPending ? <><Loader2 size={13} className="animate-spin" /> Estruturando...</> : <><Sparkles size={13} /> Salvar proposta estruturada</>}
              </button>
              <span className="muted" style={{ alignSelf: "center", fontSize: 10 }}>A proposta fica em draft e exige revisão/confirmação.</span>
            </div>
            {proposalMessage && <div className="operational-banner" style={{ marginTop: 9, fontSize: 10 }}><Sparkles size={13} /> {proposalMessage}</div>}
          </div>
        )}
        {voiceError && (
          <div className="demo-banner" style={{ margin: "12px 0 0" }} role="alert">
            <Info size={14} /> <span>{voiceError} O formulário abaixo continua disponível como fallback.</span>
          </div>
        )}
      </section>
      {profileQuery.data?.checklist && (
        <section className="surface" style={{ padding: 18, marginBottom: 18, display: currentStepId === "review" ? undefined : "none" }}>
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
      <section className="surface" style={{ padding: 18, marginBottom: 18, display: currentStepId === "review" ? undefined : "none" }}>
        <SectionTitle eyebrow="Simulação segura" title="Revise exemplos antes de publicar" />
        <p className="muted" style={{ margin: "-5px 0 14px", fontSize: 11, lineHeight: 1.5 }}>
          Teste uma mensagem com o rascunho atual. A resposta é determinística, não chama um provider e só usa o catálogo, disponibilidade e regras aprovadas deste workspace.
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {["Qual é o preço do meu serviço?", "Quais horários estão disponíveis?", "Quero falar com uma pessoa."].map(example => (
            <button key={example} type="button" className="btn-ghost" style={{ padding: "5px 8px", fontSize: 9 }} onClick={() => setSimulationMessage(example)}>{example}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div className="form-field" style={{ flex: 1 }}>
            <label htmlFor="onboarding-simulation-message">Mensagem de teste</label>
            <input id="onboarding-simulation-message" className="input-control" value={simulationMessage} onChange={event => setSimulationMessage(event.target.value)} placeholder="Ex.: Quanto custa a consulta inicial?" maxLength={2000} />
          </div>
          <button type="button" className="btn-primary" disabled={!simulationMessage.trim() || simulation.isPending} onClick={() => simulation.mutate({ profile, message: simulationMessage })}>
            <Sparkles size={13} /> {simulation.isPending ? "Testando..." : "Simular"}
          </button>
        </div>
        {simulation.error && <div className="demo-banner" style={{ marginTop: 10, fontSize: 10 }}><Info size={13} /> {simulation.error.message}</div>}
        {simulation.data && (
          <div style={{ marginTop: 12, padding: 12, border: `1px solid ${simulation.data.handoff ? "rgba(240,184,74,.25)" : "rgba(86,214,138,.22)"}`, background: simulation.data.handoff ? "rgba(240,184,74,.035)" : "rgba(86,214,138,.035)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <strong style={{ color: simulation.data.handoff ? "var(--amber)" : "#b9e4c7", fontSize: 11 }}>{simulation.data.handoff ? "Transferência indicada" : "Resposta simulada"}</strong>
              <span className="muted" style={{ fontSize: 9 }}>sem provider externo</span>
            </div>
            <p style={{ margin: "9px 0 0", color: "#c8c8c8", fontSize: 11, lineHeight: 1.5 }}>{simulation.data.response}</p>
            <div className="muted" style={{ marginTop: 8, fontSize: 9 }}>Fontes: {simulation.data.sources.length ? simulation.data.sources.join(" · ") : "nenhuma fonte específica"}</div>
          </div>
        )}
      </section>
      {metricsQuery.data && (
        <section className="surface" style={{ padding: 18, marginBottom: 18, display: currentStepId === "review" ? undefined : "none" }}>
          <SectionTitle eyebrow="Medição · últimos 30 dias" title="Qualidade do onboarding" action={<span className="muted" style={{ fontSize: 10 }}>sem conteúdo de respostas</span>} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8 }}>
            {[
              ["Sessões concluídas", metricsQuery.data.completed],
              ["Abandono estimado", metricsQuery.data.abandoned],
              ["Correções", metricsQuery.data.corrections],
              ["Follow-ups", metricsQuery.data.followUps + metricsQuery.data.conflictFollowUps],
              ["Tokens LLM", metricsQuery.data.llmTotalTokens],
              ["Áudio capturado", `${Math.round(metricsQuery.data.audioDurationMs / 1000)}s`],
            ].map(([label, value]) => (
              <div key={String(label)} style={{ padding: "10px 11px", border: "1px solid rgba(255,255,255,.07)" }}>
                <strong style={{ display: "block", color: "#ddd", fontSize: 16 }}>{value}</strong>
                <span className="muted" style={{ fontSize: 9 }}>{label}</span>
              </div>
            ))}
          </div>
          <p className="muted" style={{ margin: "10px 0 0", fontSize: 10 }}>
            Tokens são o proxy de custo até o catálogo de preços do modelo ser configurado. Abandono = sessão ativa/pausada sem atividade há 7 dias.
          </p>
        </section>
      )}
      {versionsQuery.data && versionsQuery.data.length > 0 && (
        <section className="surface" style={{ padding: 18, marginBottom: 18, display: currentStepId === "activation" ? undefined : "none" }}>
          <SectionTitle eyebrow="Histórico imutável" title="Versões publicadas" action={<span className="muted" style={{ fontSize: 10 }}>rollback cria nova versão</span>} />
          <div style={{ display: "grid", gap: 7 }}>
            {versionsQuery.data.map(version => (
              <div key={version.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "9px 10px", border: "1px solid rgba(255,255,255,.07)" }}>
                <div>
                  <strong style={{ color: "#ddd", fontSize: 11 }}>v{version.version}{version.version === profileQuery.data?.version ? " · atual" : ""}</strong>
                  <div className="muted" style={{ fontSize: 9 }}>{new Date(version.publishedAt).toLocaleString("pt-BR")}{version.rollbackOfId ? ` · rollback de #${version.rollbackOfId}` : ""}</div>
                </div>
                {version.version !== profileQuery.data?.version && (
                  <button className="btn-secondary" style={{ padding: "5px 8px", fontSize: 9 }} disabled={rollbackMutation.isPending} onClick={() => rollbackMutation.mutate({ version: version.version })}>Publicar esta versão</button>
                )}
              </div>
            ))}
          </div>
          {rollbackMutation.error && <div className="demo-banner" style={{ marginTop: 10, fontSize: 10 }}><Info size={13} /> {rollbackMutation.error.message}</div>}
        </section>
      )}
      {(profileQuery.data?.stepAnswers ?? []).length > 0 && (
        <section className="surface" style={{ padding: 18, marginBottom: 18, display: currentStepId === "review" ? undefined : "none" }}>
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
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, fontSize: 9 }}>
                        <span className="muted">Origem: {step.source === "human_form" ? "formulário" : step.source}</span>
                        {step.confidence !== null && <span className="muted">Confiança: {step.confidence}%</span>}
                        {step.missing.length > 0 && <span style={{ color: "var(--amber)" }}>Ausentes: {step.missing.map(key => fieldTitles[key] ?? key).join(", ")}</span>}
                        {step.conflicts.length > 0 && (
                          <div style={{ display: "grid", gap: 5, color: "var(--red)" }}>
                            {step.conflicts.map(conflict => (
                              <div key={conflict} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                                <span>Conflito: {conflict}</span>
                                <div style={{ display: "flex", flexBasis: "100%", gap: 6, alignItems: "center" }}>
                                  <input
                                    className="input-control"
                                    value={followUpDraft(`${step.stepKey}:conflict:${conflict}`)}
                                    onChange={event => setFollowUpDraft(`${step.stepKey}:conflict:${conflict}`, event.target.value)}
                                    placeholder="Qual versão aprovada deve valer?"
                                  />
                                  <button
                                    className="btn-secondary"
                                    style={{ padding: "3px 6px", fontSize: 9 }}
                                    disabled={!followUpDraft(`${step.stepKey}:conflict:${conflict}`).trim() || answerConflict.isPending}
                                    onClick={() => answerConflict.mutate({ stepKey: step.stepKey as "identity" | "offering" | "operations" | "guardrails" | "voice", conflictKey: conflict, value: followUpDraft(`${step.stepKey}:conflict:${conflict}`) })}
                                  >Salvar esclarecimento</button>
                                </div>
                                <button
                                  className="btn-secondary"
                                  style={{ padding: "3px 6px", fontSize: 9 }}
                                  disabled={resolveConflict.isPending}
                                  onClick={() => resolveConflict.mutate({ stepKey: step.stepKey as "identity" | "offering" | "operations" | "guardrails" | "voice", conflictKey: conflict, resolution: "accepted_current", note: "Valor atual revisado e aceito pelo operador." })}
                                >Aceitar valor atual</button>
                                <button
                                  className="btn-secondary"
                                  style={{ padding: "3px 6px", fontSize: 9 }}
                                  disabled={resolveConflict.isPending}
                                  onClick={() => resolveConflict.mutate({ stepKey: step.stepKey as "identity" | "offering" | "operations" | "guardrails" | "voice", conflictKey: conflict, resolution: "dismissed", note: "Conflito revisado e descartado pelo operador." })}
                                >Descartar conflito</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      {step.missing.length > 0 && (
                        <div style={{ display: "grid", gap: 8, marginTop: 10, padding: 10, border: "1px solid rgba(240,184,74,.18)", background: "rgba(240,184,74,.035)" }}>
                          <strong style={{ color: "var(--amber)", fontSize: 10 }}>Perguntas de acompanhamento</strong>
                          {step.missing.map(field => {
                            const draftKey = `${step.stepKey}:missing:${field}`;
                            return (
                              <div key={field} style={{ display: "grid", gap: 5 }}>
                                <label style={{ fontSize: 10, color: "#c8c8c8" }}>Qual informação aprovada devemos registrar sobre {fieldTitles[field] ?? field}? <span className="muted">(ou “decidir depois”)</span></label>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <input className="input-control" value={followUpDraft(draftKey)} onChange={event => setFollowUpDraft(draftKey, event.target.value)} placeholder="Resposta aprovada pelo responsável" />
                                  <button className="btn-secondary" disabled={!followUpDraft(draftKey).trim() || answerFollowUp.isPending} onClick={() => answerFollowUp.mutate({ stepKey: step.stepKey as "identity" | "offering" | "operations" | "guardrails" | "voice", field, value: followUpDraft(draftKey) })}>Salvar</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
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
          {(confirmStep.error || resolveConflict.error) && <div className="demo-banner" style={{ margin: "12px 0 0" }}><Info size={14} /> {(confirmStep.error || resolveConflict.error)?.message}</div>}
        </section>
      )}
      <section className="surface" style={{ padding: 22, display: currentStepId === "identity" ? undefined : "none" }}>
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
        </div>
      </section>
      <section className="surface" style={{ padding: 22, display: currentStepId === "offering" ? undefined : "none" }}>
        <SectionTitle eyebrow="Oferta" title="Serviços que sua empresa oferece" />
        <p className="muted" style={{ margin: "-5px 0 14px", fontSize: 11 }}>
          Cadastre o que pode ser apresentado ao cliente. O catálogo é a fonte usada para preço e duração; se ainda não quiser detalhar, o texto livre continua disponível como rascunho.
        </p>
        <div style={{ display: "grid", gap: 9, marginBottom: 14 }}>
          {(servicesQuery.data ?? []).map((service: CatalogService) => (
            <div key={service.id} style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1.4fr) 120px 110px auto", gap: 8, alignItems: "center", padding: "10px 11px", border: "1px solid rgba(255,255,255,.08)" }}>
              <div>
                <strong style={{ color: "#ddd", fontSize: 11 }}>{service.name}</strong>
                <div className="muted" style={{ fontSize: 9, marginTop: 3 }}>{service.active ? "Ativo no catálogo" : "Pausado"} · {service.professionalIds.length ? `${service.professionalIds.length} profissional(is)` : "equipe geral"}</div>
              </div>
              <span style={{ fontSize: 11 }}>{formatCents(service.priceCents)}</span>
              <span className="muted" style={{ fontSize: 10 }}><Clock3 size={12} /> {service.durationMinutes} min</span>
              <button className="btn-secondary" style={{ padding: "5px 8px", fontSize: 9 }} disabled={updateService.isPending} onClick={() => updateService.mutate({ serviceId: service.id, active: !service.active })}>{service.active ? "Pausar" : "Ativar"}</button>
            </div>
          ))}
          {!servicesQuery.isLoading && !(servicesQuery.data ?? []).length && <div className="muted" style={{ padding: 12, border: "1px dashed rgba(255,255,255,.12)", fontSize: 10 }}>Nenhum serviço cadastrado ainda. Você pode decidir depois e continuar com o rascunho.</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 1.5fr) 110px 110px auto", gap: 8, alignItems: "end", marginBottom: 14 }}>
          <div className="form-field"><label htmlFor="onboarding-new-service">Novo serviço</label><input id="onboarding-new-service" className="input-control" value={newService.name} onChange={event => setNewService(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Consulta inicial" /></div>
          <div className="form-field"><label htmlFor="onboarding-new-price">Preço (R$)</label><input id="onboarding-new-price" className="input-control" inputMode="decimal" value={newService.price} onChange={event => setNewService(current => ({ ...current, price: event.target.value }))} placeholder="250,00" /></div>
          <div className="form-field"><label htmlFor="onboarding-new-duration">Duração</label><input id="onboarding-new-duration" className="input-control" type="number" min={5} max={1440} value={newService.durationMinutes} onChange={event => setNewService(current => ({ ...current, durationMinutes: Number(event.target.value) || 60 }))} /></div>
          <button className="btn-primary" onClick={addService} disabled={!newService.name.trim() || createService.isPending}><Plus size={13} /> Adicionar</button>
        </div>
        <div className="form-grid">
          {field("services", "Rascunho / regras de orçamento", "Use para explicar preços variáveis, exceções ou serviços que serão detalhados depois.", true)}
        </div>
        {catalogMessage && <div className="demo-banner" style={{ marginTop: 12 }}><Info size={13} /> {catalogMessage}</div>}
      </section>
      <section className="surface" style={{ padding: 22, display: currentStepId === "operations" ? undefined : "none" }}>
        <SectionTitle eyebrow="Funcionamento" title="Onde e quando sua equipe atende" />
        <p className="muted" style={{ margin: "-5px 0 14px", fontSize: 11 }}>
          A disponibilidade cadastrada aqui é a fonte real para orientar horários. Você pode começar com uma equipe geral e detalhar profissionais depois.
        </p>
        <div style={{ display: "grid", gap: 10, marginBottom: 14 }}>
          {(professionalsQuery.data ?? []).map((professional: CatalogProfessional) => (
            <div key={professional.id} style={{ padding: 11, border: "1px solid rgba(255,255,255,.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div><strong style={{ color: "#ddd", fontSize: 11 }}>{professional.name}</strong><div className="muted" style={{ fontSize: 9, marginTop: 3 }}>{professional.specialty || "Profissional da equipe"}</div></div>
                <span className="muted" style={{ fontSize: 9 }}>{professional.availability.length ? `${professional.availability.length} dia(s) configurado(s)` : "sem horário"}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 10 }}>
                {weekdayLabels.map((label, weekday) => {
                  const active = professional.availability.some(entry => entry.weekday === weekday);
                  return <button key={label} type="button" className={active ? "btn-primary" : "btn-ghost"} style={{ padding: "5px 8px", fontSize: 9 }} onClick={() => toggleWeekday(professional, weekday)} disabled={setProfessionalAvailability.isPending}>{label}</button>;
                })}
              </div>
              <div className="muted" style={{ fontSize: 9, marginTop: 8 }}>Serviços executados</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
                {(servicesQuery.data ?? []).map((service: CatalogService) => {
                  const linked = service.professionalIds.includes(professional.id);
                  return <label key={service.id} style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 9, color: linked ? "#b9e4c7" : "#999" }}><input type="checkbox" checked={linked} onChange={() => setServiceProfessionals.mutate({ serviceId: service.id, professionalIds: linked ? service.professionalIds.filter(id => id !== professional.id) : [...service.professionalIds, professional.id] })} /> {service.name}</label>;
                })}
              </div>
              {professional.availability.length > 0 && <div className="muted" style={{ fontSize: 9, marginTop: 8 }}>{professional.availability.map(entry => `${weekdayLabels[entry.weekday]} ${formatMinute(entry.startMinute)}–${formatMinute(entry.endMinute)}`).join(" · ")}</div>}
            </div>
          ))}
          {!professionalsQuery.isLoading && !(professionalsQuery.data ?? []).length && <div className="muted" style={{ padding: 12, border: "1px dashed rgba(255,255,255,.12)", fontSize: 10 }}>Nenhum profissional cadastrado. O catálogo pode funcionar com equipe geral por enquanto.</div>}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", marginBottom: 14 }}>
          <div className="form-field" style={{ flex: 1 }}><label htmlFor="onboarding-new-professional">Adicionar profissional</label><input id="onboarding-new-professional" className="input-control" value={newProfessionalName} onChange={event => setNewProfessionalName(event.target.value)} placeholder="Ex.: Ana Souza" /></div>
          <button className="btn-primary" onClick={addProfessional} disabled={!newProfessionalName.trim() || createProfessional.isPending}><Plus size={13} /> Adicionar</button>
        </div>
        <div className="form-grid">
          {field("serviceArea", "Cidade e área de atendimento", "Cidades, bairros, deslocamento e limites", true)}
          {field("businessHours", "Observações operacionais", "Exceções, intervalos, deslocamento e regras que ainda não foram detalhadas no catálogo", true)}
        </div>
      </section>
      <section className="surface" style={{ padding: 22, display: currentStepId === "activation" ? undefined : "none" }}>
        <SectionTitle eyebrow="Pronto para começar" title="Ative o atendimento com segurança" />
        <p className="muted" style={{ margin: "-5px 0 14px", fontSize: 11, lineHeight: 1.5 }}>
          Publicar cria uma versão operacional das regras confirmadas. O agente só poderá usar o que foi informado e aprovado; depois, conecte o canal de WhatsApp para começar a atender.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            className="btn-primary"
            disabled={saveMutation.isPending || !readyForHumanApprovedPublish}
            onClick={() => saveMutation.mutate({ profile, publish: true })}
            title={!readyForHumanApprovedPublish ? "Revise e confirme os quatro blocos obrigatórios antes de publicar" : undefined}
          >
            <Sparkles size={13} /> {saveMutation.isPending ? "Publicando..." : "Publicar configuração"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setLocation("/whatsapp-connection")} disabled={!published}>
            Conectar WhatsApp
          </button>
          {published && <span className="green" style={{ fontSize: 11 }}><CheckCircle2 size={13} /> Configuração v{savedVersion} publicada</span>}
        </div>
        {!readyForHumanApprovedPublish && <p className="muted" style={{ margin: "12px 0 0", fontSize: 10 }}>Ainda faltam blocos obrigatórios confirmados. Volte à Revisão para ver exatamente o que falta.</p>}
        {saveMutation.error && <div className="demo-banner" style={{ marginTop: 14, marginBottom: 0 }}><Info size={14} /> {saveMutation.error.message}</div>}
      </section>
      <section className="surface" style={{ padding: 22, marginTop: 18, display: currentStepId === "guardrails" ? undefined : "none" }}>
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
