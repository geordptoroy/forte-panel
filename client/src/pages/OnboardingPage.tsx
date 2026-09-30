import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  DollarSign,
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
  UserPlus,
  Volume2,
} from "lucide-react";
import { useLocation } from "wouter";
import PanelLayout, { SectionTitle } from "@/components/PanelLayout";
import { trpc } from "@/lib/trpc";
import { formatServicePrice, type ServicePriceType } from "../../../shared/service-price";
import { onboardingReviewExamples, type OnboardingSimulationResult } from "../../../shared/onboarding-simulation";

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
type AvailabilityEntry = { weekday: number; startMinute: number; endMinute: number };
const weekdays = [
  { value: 0, label: "Domingo", short: "DOM" },
  { value: 1, label: "Segunda", short: "SEG" },
  { value: 2, label: "Terça", short: "TER" },
  { value: 3, label: "Quarta", short: "QUA" },
  { value: 4, label: "Quinta", short: "QUI" },
  { value: 5, label: "Sexta", short: "SEX" },
  { value: 6, label: "Sábado", short: "SÁB" },
];
const minuteToTime = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const timeToMinute = (value: string) => {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
};
const catalogGuidance = "Use somente os serviços ativos do catálogo operacional para informar serviço, preço e duração. Se um dado não estiver no catálogo, confirme com a equipe. Consulte a agenda para cada horário; jornada semanal não confirma uma vaga.";
const deferredCatalogGuidance = "Cadastro de serviços adiado pelo responsável. Não informe preço, duração ou disponibilidade sem consultar a equipe e as fontes operacionais reais.";
const deferredHoursGuidance = "Horários ainda não cadastrados. Confirme com a equipe e consulte a agenda real antes de sugerir ou confirmar qualquer horário.";

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
  const catalogQuery = trpc.workspace.services.useQuery();
  const professionalsQuery = trpc.workspace.professionalsDetailed.useQuery();
  const metricsQuery = trpc.onboarding.metrics.useQuery({ windowDays: 30 });
  const versionsQuery = trpc.onboarding.versions.useQuery();
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [simulationResult, setSimulationResult] = useState<OnboardingSimulationResult | null>(null);
  const [simulationMessage, setSimulationMessage] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [serviceDescription, setServiceDescription] = useState("");
  const [serviceDuration, setServiceDuration] = useState("60");
  const [servicePrice, setServicePrice] = useState("");
  const [servicePriceType, setServicePriceType] = useState<ServicePriceType>("quote");
  const [serviceProfessionalIds, setServiceProfessionalIds] = useState<number[]>([]);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [professionalName, setProfessionalName] = useState("");
  const [professionalSpecialty, setProfessionalSpecialty] = useState("");
  const [availabilityProfessionalId, setAvailabilityProfessionalId] = useState<number | null>(null);
  const [availabilityDraft, setAvailabilityDraft] = useState<AvailabilityEntry[]>([]);
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
  const simulateExamplesMutation = trpc.onboarding.simulateExamples.useMutation();
  const reviewExamplesMutation = trpc.onboarding.reviewExamples.useMutation({
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
  const createCatalogService = trpc.workspace.createService.useMutation({
    onSuccess: async () => {
      await utils.workspace.services.invalidate();
    },
  });
  const linkCatalogService = trpc.workspace.setServiceProfessionals.useMutation({
    onSuccess: async () => {
      await utils.workspace.services.invalidate();
      await utils.workspace.professionalsDetailed.invalidate();
    },
  });
  const createCatalogProfessional = trpc.workspace.createProfessional.useMutation({
    onSuccess: async professional => {
      setAvailabilityProfessionalId(professional.id);
      setProfessionalName("");
      setProfessionalSpecialty("");
      await utils.workspace.professionalsDetailed.invalidate();
    },
  });
  const saveProfessionalAvailability = trpc.workspace.setProfessionalAvailability.useMutation({
    onSuccess: async () => {
      await utils.workspace.professionalsDetailed.invalidate();
      setCatalogMessage("Disponibilidade semanal salva no catálogo operacional.");
    },
  });
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
  const catalogServices = catalogQuery.data ?? [];
  const professionals = professionalsQuery.data ?? [];
  const activeProfessionals = professionals.filter(professional => professional.active);
  const selectedAvailabilityProfessional = professionals.find(professional => professional.id === availabilityProfessionalId) ?? activeProfessionals[0];
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
    if (!activeProfessionals.length) return;
    if (!activeProfessionals.some(professional => professional.id === availabilityProfessionalId))
      setAvailabilityProfessionalId(activeProfessionals[0]!.id);
  }, [activeProfessionals, availabilityProfessionalId]);

  useEffect(() => {
    setAvailabilityDraft(selectedAvailabilityProfessional?.availability.map(entry => ({ ...entry })) ?? []);
  }, [selectedAvailabilityProfessional?.id, selectedAvailabilityProfessional?.availability]);

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
  const updateIfBlank = (key: keyof Profile, value: string) => {
    if (profile[key].trim()) return;
    setDirty(true);
    setProfile(current => current[key].trim() ? current : { ...current, [key]: value });
  };
  const addOperationalService = async () => {
    setCatalogMessage("");
    const durationMinutes = Number(serviceDuration);
    const parsedPrice = Number(servicePrice.replace(",", "."));
    try {
      const created = await createCatalogService.mutateAsync({
        name: serviceName,
        description: serviceDescription || undefined,
        durationMinutes: Number.isInteger(durationMinutes) && durationMinutes >= 5 ? durationMinutes : 60,
        priceCents: servicePriceType === "quote" ? 0 : Number.isFinite(parsedPrice) && parsedPrice >= 0 ? Math.round(parsedPrice * 100) : 0,
        priceType: servicePriceType,
      });
      if (serviceProfessionalIds.length)
        await linkCatalogService.mutateAsync({ serviceId: created.id, professionalIds: serviceProfessionalIds });
      setServiceName("");
      setServiceDescription("");
      setServiceDuration("60");
      setServicePrice("");
      setServicePriceType("quote");
      setServiceProfessionalIds([]);
      updateIfBlank("services", catalogGuidance);
      setCatalogMessage("Serviço salvo no catálogo operacional. Revise e confirme este bloco antes de publicar.");
      await catalogQuery.refetch();
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : "Não foi possível salvar o serviço.");
      await catalogQuery.refetch();
    }
  };
  const addOperationalProfessional = async () => {
    setCatalogMessage("");
    try {
      await createCatalogProfessional.mutateAsync({ name: professionalName, specialty: professionalSpecialty || undefined });
      setCatalogMessage("Profissional cadastrado. Defina os dias e horários de trabalho abaixo.");
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : "Não foi possível cadastrar o profissional.");
    }
  };
  const saveAvailability = async () => {
    if (!selectedAvailabilityProfessional) return;
    setCatalogMessage("");
    try {
      await saveProfessionalAvailability.mutateAsync({
        professionalId: selectedAvailabilityProfessional.id,
        entries: [...availabilityDraft].sort((a, b) => a.weekday - b.weekday),
      });
      updateIfBlank("businessHours", "Use a disponibilidade semanal registrada para a equipe como jornada de trabalho. Ela não confirma uma vaga; verifique a agenda real antes de sugerir horários.");
    } catch (error) {
      setCatalogMessage(error instanceof Error ? error.message : "Não foi possível salvar os horários.");
    }
  };
  const confirmedStepKeys = new Set(
    (profileQuery.data?.stepAnswers ?? [])
      .filter(answer => answer.status === "confirmed")
      .map(answer => answer.stepKey)
  );
  const exampleReviewIsCurrent = profileQuery.data?.exampleReview.isCurrent === true;
  const requiredBlocksConfirmed = requiredStepKeys.every(stepKey => confirmedStepKeys.has(stepKey));
  const readyForHumanApprovedPublish =
    !dirty && autosaveState !== "error" &&
    profileQuery.data?.checklist.readyToPublish === true &&
    requiredBlocksConfirmed &&
    exampleReviewIsCurrent;
  const confirmedRequiredCount = requiredStepKeys.filter(stepKey => confirmedStepKeys.has(stepKey)).length;
  const simulationMatchesDraft = Boolean(
    simulationResult &&
    !dirty &&
    simulationResult.profileFingerprint === profileQuery.data?.publishCandidateFingerprint
  );
  const transcriptionConsentGranted = governanceQuery.data?.consents.some(
    consent => consent.source === "transcription" && consent.status === "granted"
  ) === true;
  const llmConsentGranted = governanceQuery.data?.consents.some(
    consent => consent.source === "llm" && consent.status === "granted"
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

  const simulateRuleExamples = async () => {
    if (!llmConsentGranted) {
      setSimulationMessage("Conceda o consentimento para processamento por IA ou revise os exemplos seguros sem IA.");
      return;
    }
    setSimulationMessage("");
    try {
      await autosave.mutateAsync({ profile });
      await profileQuery.refetch();
      const result = await simulateExamplesMutation.mutateAsync();
      setSimulationResult(result);
      setSimulationMessage("Prévia gerada para revisão. Nada foi confirmado ou publicado.");
    } catch (error) {
      setSimulationMessage(error instanceof Error ? error.message : "Não foi possível simular as respostas agora.");
    }
  };

  const markExamplesReviewed = async (mode: "safe" | "ai") => {
    if (dirty || autosaveState === "waiting" || autosaveState === "saving" || autosaveState === "error") {
      setSimulationMessage("Aguarde o salvamento do rascunho ou corrija o erro de autosave antes de confirmar a revisão.");
      return;
    }
    if (mode === "ai" && (!simulationResult || !simulationMatchesDraft)) {
      setSimulationMessage("Esta simulação não corresponde mais ao rascunho atual. Gere outra antes de confirmá-la.");
      return;
    }
    setSimulationMessage("");
    try {
      await reviewExamplesMutation.mutateAsync(mode === "ai"
        ? { mode, profileFingerprint: simulationResult!.profileFingerprint }
        : { mode });
      setSimulationMessage("Revisão humana registrada para este rascunho. A publicação ainda exige confirmar os blocos obrigatórios.");
    } catch (error) {
      setSimulationMessage(error instanceof Error ? error.message : "Não foi possível registrar a revisão.");
    }
  };

  const addSimulationExampleToFaq = (example: OnboardingSimulationResult["examples"][number]) => {
    if (!simulationMatchesDraft) {
      setSimulationMessage("A simulação está desatualizada; gere uma nova antes de reutilizar uma resposta.");
      return;
    }
    const entry = `Pergunta: ${example.customerMessage}\nResposta sugerida: ${example.suggestedReply}`;
    if (profile.faq.includes(entry)) {
      setSimulationMessage("Esse exemplo já está no FAQ do rascunho.");
    } else {
      update("faq", [profile.faq.trim(), entry].filter(Boolean).join("\n\n"));
      setSimulationMessage("Adicionado ao FAQ como rascunho. Revise a resposta no passo Atendimento e confirme o bloco manualmente.");
    }
    setCurrentStep(3);
  };

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
      <section className="surface" aria-label="Revisão de exemplos de atendimento" style={{ padding: 18, marginBottom: 18, display: currentStepId === "review" ? undefined : "none" }}>
        <SectionTitle
          eyebrow="Simulação antes de ativar"
          title="Confira como as regras devem se comportar"
          action={<span className={exampleReviewIsCurrent ? "green" : "muted"} style={{ fontSize: 10 }}>{exampleReviewIsCurrent ? "Revisão humana registrada" : "Revisão necessária para publicar"}</span>}
        />
        <p className="muted" style={{ margin: "-5px 0 12px", fontSize: 10, lineHeight: 1.55 }}>
          Os casos seguros abaixo não usam IA. A simulação opcional gera respostas para o rascunho atual, mas não consulta agenda/catálogo em tempo real, não salva as respostas e nunca confirma nem publica regras. A revisão humana fica vinculada ao conteúdo exato que será publicado.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
          {onboardingReviewExamples.map(example => (
            <div key={example.key} style={{ padding: 11, border: "1px solid rgba(255,255,255,.08)", background: "rgba(255,255,255,.012)" }}>
              <strong style={{ display: "block", color: "#ddd", fontSize: 10 }}>{example.title}</strong>
              <small className="muted" style={{ display: "block", marginTop: 6 }}>Cliente: “{example.customerMessage}”</small>
              <small style={{ display: "block", marginTop: 7, color: "#b9e4c7", lineHeight: 1.45 }}>Esperado: {example.expectedBehavior}</small>
              <small className="muted" style={{ display: "block", marginTop: 5 }}>
                {example.requiresHuman ? "Encaminhar à equipe quando necessário" : "Sem transferência automática"}
                {example.requiresLiveAgenda ? " · consultar agenda real" : ""}
              </small>
            </div>
          ))}
        </div>
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={!llmConsentGranted || simulateExamplesMutation.isPending || autosave.isPending}
            title={!llmConsentGranted ? "Conceda o consentimento para processamento por IA na seção Governança" : undefined}
            onClick={() => void simulateRuleExamples()}
          >
            {simulateExamplesMutation.isPending || autosave.isPending ? <><Loader2 size={13} className="animate-spin" /> Simulando...</> : <><Sparkles size={13} /> Simular respostas com IA</>}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={reviewExamplesMutation.isPending || dirty || autosaveState === "waiting" || autosaveState === "saving" || autosaveState === "error" || !profileQuery.data?.publishCandidateFingerprint || (exampleReviewIsCurrent && !simulationMatchesDraft)}
            onClick={() => void markExamplesReviewed(simulationMatchesDraft ? "ai" : "safe")}
          >
            <CheckCircle2 size={13} /> {reviewExamplesMutation.isPending ? "Registrando revisão..." : simulationMatchesDraft ? "Confirmar revisão da simulação" : exampleReviewIsCurrent ? "Exemplos revisados" : "Confirmar revisão dos exemplos seguros"}
          </button>
          {exampleReviewIsCurrent && profileQuery.data?.exampleReview.reviewedAt && (
            <small className="green" style={{ alignSelf: "center", fontSize: 9 }}>
              Revisado em {new Date(profileQuery.data.exampleReview.reviewedAt).toLocaleString("pt-BR")} ({profileQuery.data.exampleReview.mode === "ai" ? "simulação IA" : profileQuery.data.exampleReview.mode === "rollback" ? "versão restaurada" : "casos seguros"})
            </small>
          )}
        </div>
        {!llmConsentGranted && <p className="muted" style={{ margin: "8px 0 0", fontSize: 9 }}>A prévia por IA exige consentimento explícito para processamento por IA. Você ainda pode revisar os casos seguros sem enviar dados.</p>}
        {simulationMessage && <div className="demo-banner" role="status" style={{ margin: "10px 0 0", fontSize: 10 }}><Info size={13} /> {simulationMessage}</div>}
        {simulationResult && (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {!simulationMatchesDraft && <div className="demo-banner" role="alert" style={{ margin: 0, fontSize: 10 }}><Info size={13} /> O rascunho mudou desde esta simulação. Gere outra para revisar ou reutilizar as respostas; você ainda pode confirmar os casos seguros acima.</div>}
            {simulationResult.examples.map(example => (
              <div key={example.key} style={{ padding: 11, border: "1px solid rgba(86,214,138,.16)" }}>
                <strong style={{ display: "block", color: "#ddd", fontSize: 10 }}>{example.title} · resposta sugerida (rascunho)</strong>
                <p style={{ margin: "6px 0", color: "#c8c8c8", fontSize: 10, lineHeight: 1.5 }}>{example.suggestedReply}</p>
                <small className="muted" style={{ display: "block", lineHeight: 1.45 }}>Base da sugestão: {example.basisNote}</small>
                <button type="button" className="btn-secondary" style={{ marginTop: 8, padding: "5px 8px", fontSize: 9 }} disabled={!simulationMatchesDraft} onClick={() => addSimulationExampleToFaq(example)}>
                  Usar no FAQ como rascunho
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
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
          Os serviços, preços e durações são salvos no catálogo operacional. Você pode cadastrar só o primeiro agora e completar o restante depois.
        </p>
        <div className="team-table" style={{ marginBottom: 18 }}>
          {catalogQuery.isLoading ? <p className="muted">Carregando catálogo...</p> : catalogServices.length === 0 ? (
            <p className="muted">Nenhum serviço operacional cadastrado. Se ainda não quiser definir a oferta, use “Decidir depois” abaixo; a orientação ficará sem preço ou prazo inventado.</p>
          ) : catalogServices.map(service => (
            <div className="team-row" key={service.id} style={{ flexWrap: "wrap" }}>
              <div className="row-copy" style={{ minWidth: 220 }}>
                <strong>{service.name}{service.active ? "" : " · inativo"}</strong>
                <small>{service.description || "Sem descrição"}</small>
                <small style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 5 }}>
                  <span><Clock3 size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />{service.durationMinutes} min</span>
                  <span><DollarSign size={11} style={{ verticalAlign: "middle", marginRight: 4 }} />{formatServicePrice(service.priceType, service.priceCents)}</span>
                </small>
              </div>
              <small className="muted">{service.professionalIds.length ? service.professionalIds.map(id => professionals.find(person => person.id === id)?.name).filter(Boolean).join(", ") : "Sem profissional vinculado"}</small>
            </div>
          ))}
        </div>
        <SectionTitle eyebrow="Catálogo persistido" title="Adicionar serviço" />
        <div className="form-grid">
          <div className="form-field"><label htmlFor="onboarding-service-name">Nome do serviço</label><input id="onboarding-service-name" className="input-control" value={serviceName} onChange={event => setServiceName(event.target.value)} placeholder="Ex.: Consulta inicial" /></div>
          <div className="form-field"><label htmlFor="onboarding-service-duration">Duração (minutos)</label><input id="onboarding-service-duration" className="input-control" type="number" min={5} max={1440} value={serviceDuration} onChange={event => setServiceDuration(event.target.value)} /></div>
          <div className="form-field"><label htmlFor="onboarding-service-price-type">Como informar o preço</label><select id="onboarding-service-price-type" className="select-control" value={servicePriceType} onChange={event => setServicePriceType(event.target.value as ServicePriceType)}><option value="fixed">Preço fixo</option><option value="starting_at">A partir de</option><option value="quote">Sob consulta</option></select></div>
          {servicePriceType !== "quote" && <div className="form-field"><label htmlFor="onboarding-service-price">{servicePriceType === "starting_at" ? "Preço inicial (R$)" : "Preço fixo (R$)"}</label><input id="onboarding-service-price" className="input-control" type="number" min={0} step="0.01" value={servicePrice} onChange={event => setServicePrice(event.target.value)} placeholder="0,00" /></div>}
          <div className="form-field full"><label htmlFor="onboarding-service-description">Descrição (opcional)</label><input id="onboarding-service-description" className="input-control" value={serviceDescription} onChange={event => setServiceDescription(event.target.value)} placeholder="O que está incluído" /></div>
          <div className="form-field full"><label>Profissionais que executam (opcional)</label>
            {activeProfessionals.length === 0 ? <small className="muted">Você pode cadastrar um profissional no passo Operação e vincular depois.</small> : <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {activeProfessionals.map(person => <label key={person.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11 }}><input type="checkbox" checked={serviceProfessionalIds.includes(person.id)} onChange={event => setServiceProfessionalIds(current => event.target.checked ? [...current, person.id] : current.filter(id => id !== person.id))} />{person.name}</label>)}
            </div>}
          </div>
        </div>
        <div className="form-actions">
          <button className="btn-primary" disabled={createCatalogService.isPending || linkCatalogService.isPending || serviceName.trim().length < 2} onClick={() => void addOperationalService()}><Plus size={13} />{createCatalogService.isPending || linkCatalogService.isPending ? "Salvando..." : "Salvar no catálogo"}</button>
        </div>
        <div style={{ marginTop: 20 }}>
          <SectionTitle eyebrow="Orientação aprovada" title="Como o atendimento deve tratar a oferta" />
          <p className="muted" style={{ margin: "-5px 0 10px", fontSize: 10 }}>O campo livre abaixo é complementar; não substitui o catálogo nem autoriza prometer preço, duração ou vaga.</p>
          {field("services", "Observações complementares (opcional)", "Não repita preços como fonte oficial. Use para contexto que não cabe no catálogo.", true)}
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => update("services", catalogGuidance)}>Usar o catálogo como fonte oficial</button>
            <button type="button" className="btn-secondary" onClick={() => update("services", deferredCatalogGuidance)}>Decidir depois</button>
          </div>
        </div>
        {catalogMessage && <div className="demo-banner" style={{ margin: "12px 0 0" }}><Info size={14} />{catalogMessage}</div>}
      </section>
      <section className="surface" style={{ padding: 22, display: currentStepId === "operations" ? undefined : "none" }}>
        <SectionTitle eyebrow="Funcionamento" title="Onde e quando sua equipe atende" />
        <p className="muted" style={{ margin: "-5px 0 14px", fontSize: 11 }}>
          Configure a jornada semanal real por profissional. Ela não garante uma vaga: horários específicos precisam ser consultados na agenda.
        </p>
        <div className="form-grid">
          {field("serviceArea", "Cidade e área de atendimento", "Cidades, bairros, deslocamento e limites", true)}
          {field("businessHours", "Orientação sobre horários (complementar)", "Explique exceções ou use a disponibilidade semanal salva abaixo", true)}
        </div>
        <div style={{ marginTop: 18 }}>
          <SectionTitle eyebrow="Equipe executora" title="Profissionais e disponibilidade semanal" />
          {activeProfessionals.length > 0 && <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="form-field"><label htmlFor="onboarding-availability-professional">Profissional</label><select id="onboarding-availability-professional" className="select-control" value={selectedAvailabilityProfessional?.id ?? ""} onChange={event => setAvailabilityProfessionalId(Number(event.target.value))}>{activeProfessionals.map(person => <option key={person.id} value={person.id}>{person.name}{person.specialty ? ` · ${person.specialty}` : ""}</option>)}</select></div>
            <div className="form-field"><label>Serviços vinculados</label><small className="muted">{selectedAvailabilityProfessional?.serviceIds.length ? selectedAvailabilityProfessional.serviceIds.map(id => catalogServices.find(service => service.id === id)?.name).filter(Boolean).join(", ") : "Nenhum serviço vinculado ainda"}</small></div>
          </div>}
          {selectedAvailabilityProfessional ? <div className="team-table">{weekdays.map(day => {
            const entry = availabilityDraft.find(item => item.weekday === day.value);
            return <div className="team-row" key={day.value} style={{ flexWrap: "wrap" }}>
              <strong style={{ width: 48, fontSize: 10 }}>{day.short}</strong>
              <div className="row-copy" style={{ flex: 1, minWidth: 190 }}><small>{day.label}</small>{entry ? <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}><input aria-label={`${day.label} início`} className="input-control" style={{ maxWidth: 120 }} type="time" value={minuteToTime(entry.startMinute)} onChange={event => setAvailabilityDraft(current => current.map(item => item.weekday === day.value ? { ...item, startMinute: timeToMinute(event.target.value) } : item))} /><span className="muted">até</span><input aria-label={`${day.label} fim`} className="input-control" style={{ maxWidth: 120 }} type="time" value={minuteToTime(entry.endMinute)} onChange={event => setAvailabilityDraft(current => current.map(item => item.weekday === day.value ? { ...item, endMinute: timeToMinute(event.target.value) } : item))} /></div> : <small className="muted" style={{ display: "block", marginTop: 4 }}>Não trabalha neste dia</small>}</div>
              <button type="button" className="btn-ghost" onClick={() => setAvailabilityDraft(current => entry ? current.filter(item => item.weekday !== day.value) : [...current, { weekday: day.value, startMinute: 9 * 60, endMinute: 18 * 60 }])}>{entry ? "Remover" : "Adicionar"}</button>
            </div>;
          })}</div> : <p className="muted">Ainda não há profissionais ativos. Você pode cadastrar alguém agora ou deixar a capacidade para depois.</p>}
          {selectedAvailabilityProfessional && <button type="button" className="btn-primary" style={{ marginTop: 12 }} disabled={saveProfessionalAvailability.isPending} onClick={() => void saveAvailability()}><CalendarClock size={13} />{saveProfessionalAvailability.isPending ? "Salvando..." : "Salvar disponibilidade"}</button>}
          <div className="surface" style={{ padding: 14, marginTop: 16 }}>
            <SectionTitle eyebrow="Novo executor" title="Cadastrar profissional" />
            <div className="form-grid"><div className="form-field"><label htmlFor="onboarding-professional-name">Nome</label><input id="onboarding-professional-name" className="input-control" value={professionalName} onChange={event => setProfessionalName(event.target.value)} placeholder="Ex.: Ana Souza" /></div><div className="form-field"><label htmlFor="onboarding-professional-specialty">Especialidade (opcional)</label><input id="onboarding-professional-specialty" className="input-control" value={professionalSpecialty} onChange={event => setProfessionalSpecialty(event.target.value)} placeholder="Ex.: Consultoria" /></div></div>
            <button type="button" className="btn-secondary" disabled={createCatalogProfessional.isPending || professionalName.trim().length < 2} onClick={() => void addOperationalProfessional()}><UserPlus size={13} />{createCatalogProfessional.isPending ? "Salvando..." : "Cadastrar profissional"}</button>
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={() => update("businessHours", "Use a jornada semanal registrada por profissional apenas como referência. Consulte a agenda real para confirmar horários específicos.")}>Usar jornadas salvas como referência</button>
            <button type="button" className="btn-secondary" onClick={() => update("businessHours", deferredHoursGuidance)}>Ainda não sei: decidir depois</button>
          </div>
          {catalogMessage && <div className="demo-banner" style={{ margin: "12px 0 0" }}><Info size={14} />{catalogMessage}</div>}
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
            title={!readyForHumanApprovedPublish ? exampleReviewIsCurrent ? "Revise e confirme os quatro blocos obrigatórios antes de publicar" : "Revise e confirme os exemplos de atendimento antes de publicar" : undefined}
          >
            <Sparkles size={13} /> {saveMutation.isPending ? "Publicando..." : "Publicar configuração"}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setLocation("/whatsapp-connection")} disabled={!published}>
            Conectar WhatsApp
          </button>
          {published && <span className="green" style={{ fontSize: 11 }}><CheckCircle2 size={13} /> Configuração v{savedVersion} publicada</span>}
        </div>
        {!readyForHumanApprovedPublish && <p className="muted" style={{ margin: "12px 0 0", fontSize: 10 }}>{!exampleReviewIsCurrent ? "Revise os exemplos de atendimento no passo Revisão; qualquer alteração posterior exige revisar novamente." : "Ainda faltam blocos obrigatórios confirmados. Volte à Revisão para ver exatamente o que falta."}</p>}
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
            title={!readyForHumanApprovedPublish ? exampleReviewIsCurrent ? "Salve o rascunho e confirme os blocos obrigatórios antes de publicar" : "Revise os exemplos no passo Revisão antes de publicar" : undefined}
          >
            <Sparkles size={13} />{" "}
            {saveMutation.isPending ? "Gerando..." : readyForHumanApprovedPublish ? "Gerar e publicar prompt" : !exampleReviewIsCurrent ? "Revise os exemplos antes de ativar" : "Confirme os blocos obrigatórios"}
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
