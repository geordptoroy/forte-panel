import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Info,
  ListChecks,
  Loader2,
  Mic,
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
      {governanceQuery.data && (
        <section className="surface" style={{ padding: 18, marginBottom: 18 }}>
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
      <section className="surface" style={{ padding: 18, marginBottom: 18 }}>
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
