export type AgentSafetyDecision = "allow" | "handoff";

export type AgentSafetyResult = {
  decision: AgentSafetyDecision;
  reason: "prompt_injection" | "self_harm" | "violence" | "sexual_minors" | "credential_exfiltration" | null;
  matchedSignal: string | null;
};

type SafetyRule = {
  reason: Exclude<AgentSafetyResult["reason"], null>;
  patterns: RegExp[];
};

const rules: SafetyRule[] = [
  {
    reason: "prompt_injection",
    patterns: [
      /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
      /ignore\s+as\s+instru[cç][oõ]es\s+(anteriores|acima)/i,
      /disregard\s+(the\s+)?(system|developer|previous)/i,
      /desconsidere\s+(as\s+)?instru[cç][oõ]es/i,
      /reveal\s+(the\s+)?(system\s+)?prompt/i,
      /mostre\s+(o\s+)?prompt\s+(do\s+)?sistema/i,
      /system\s+message|mensagem\s+do\s+sistema/i,
      /jailbreak|dan\s+mode|developer\s+mode/i,
    ],
  },
  {
    reason: "credential_exfiltration",
    patterns: [
      /(?:reveal|show|send|print|tell).{0,30}(api[_\s-]?key|token|password|secret|senha|segredo)/i,
      /(?:me\s+envie|mostre|revele).{0,30}(chave|token|senha|segredo)/i,
      /(?:api[_\s-]?key|token|senha|segredo).{0,30}(do\s+sistema|interno|provider)/i,
    ],
  },
  {
    reason: "sexual_minors",
    patterns: [
      /\b(?:underage|minor|child|children|crian[cç]a|menor(?:es)?|adolescente)\b.{0,45}\b(?:sex|sexual|nude|naked|sexo|n[uú]de|n[uú]do)\b/i,
      /\b(?:sex|sexual|nude|naked|sexo|n[uú]de|n[uú]do)\b.{0,45}\b(?:underage|minor|child|children|crian[cç]a|menor(?:es)?|adolescente)\b/i,
    ],
  },
  {
    reason: "self_harm",
    patterns: [
      /\b(?:kill|hurt|harm)\s+(?:myself|yourself)|\b(?:suicid|self[-\s]?harm|self[-\s]?injur)/i,
      /\b(?:me\s+matar|me\s+machucar|tirar\s+minha\s+vida|suic[ií]dio|automutila)/i,
    ],
  },
  {
    reason: "violence",
    patterns: [
      /\b(?:how\s+to\s+(?:make|build|get)\s+(?:a\s+)?(?:bomb|weapon)|instructions?\s+for\s+(?:an\s+)?attack)/i,
      /\b(?:como\s+fazer|instru[cç][oõ]es\s+para)\s+(?:uma\s+)?(?:bomba|arma|ataque)\b/i,
      /\b(?:matar|assassinar|explodir)\b.{0,35}\b(?:algu[eé]m|pessoa|cliente)\b/i,
    ],
  },
];

function normalize(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function inspectAgentInput(input: {
  content: string;
  messages?: Array<{ content: string; messageType: string }>;
}): AgentSafetyResult {
  const text = normalize([
    input.content,
    ...(input.messages ?? []).map((message) => message.content),
  ].join("\n"));
  for (const rule of rules) {
    const matched = rule.patterns.find((pattern) => pattern.test(text));
    if (matched) {
      return {
        decision: "handoff",
        reason: rule.reason,
        matchedSignal: matched.source,
      };
    }
  }
  return { decision: "allow", reason: null, matchedSignal: null };
}

export function safetyHandoffMessage(reason: Exclude<AgentSafetyResult["reason"], null>) {
  if (reason === "self_harm")
    return "Vou encaminhar sua mensagem para uma pessoa da equipe para que você receba atenção adequada.";
  if (reason === "sexual_minors" || reason === "violence")
    return "Vou encaminhar sua mensagem para atendimento humano.";
  return "Vou encaminhar sua mensagem para atendimento humano, que poderá ajudar com segurança.";
}
