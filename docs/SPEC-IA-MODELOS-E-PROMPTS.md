# Spec: Modelos de IA, montador de prompt e moderação

**Estado:** proposta para revisão humana — nenhuma implementação desta spec começou.

## Objetivo

Criar uma configuração central no Console Admin para que cada operação real do produto tenha provider, credencial, modelo e fallback editáveis individualmente. O sistema deve usar essas operações no runtime sem transformar o fluxo em um canvas de nodes.

O Console Admin deve controlar também o modelo e o prompt do **montador de prompt** usado no onboarding do Workspace. Esse modelo recebe as respostas de texto e/ou a transcrição da gravação feita pelo proprietário e transforma esse material num prompt estruturado do negócio. O prompt gerado continua sujeito a revisão/publicação conforme o fluxo de onboarding; não deve ser publicado silenciosamente por uma chamada LLM.

## Mapa de capabilities

| ID | Nome no Console Admin | Entrada | Saída | Consumidor |
|---|---|---|---|---|
| `whatsapp_reply` | Resposta do WhatsApp | texto normalizado, histórico, prompts, contexto e ferramentas | resposta do agente | envio Baileys |
| `audio_transcription` | Transcrição de áudio | mídia de áudio recebida | texto transcrito | Resposta do WhatsApp |
| `image_analysis` | Vision | imagem recebida | análise textual factual | Resposta do WhatsApp |
| `document_analysis` | Análise de documento | PDF/arquivo recebido | extração/análise textual | Resposta do WhatsApp |
| `video_analysis` | Análise de vídeo | vídeo recebido | análise textual factual | Resposta do WhatsApp |
| `prompt_builder` | Montador de prompt | respostas de onboarding e transcrição/texto da empresa | prompt de negócio estruturado/draft | onboarding e revisão do Workspace |
| `moderation` | Moderação | conteúdo normalizado e/ou resposta candidata | decisão allow/review/block + motivo | safety gate/handoff/envio |

O `messageType` continua vindo do Baileys. Não será criada uma capability de classificação de tipo de mensagem.

## Fluxo real de atendimento

```text
Baileys entrega evento com messageType
  -> debounce por Workspace
  -> moderation de entrada, se ativada e aprovada
  -> audio_transcription, image_analysis, document_analysis ou video_analysis quando aplicável
  -> whatsapp_reply (único agente que responde)
  -> moderation de saída, se ativada e aprovada
  -> wait/presença humanizada
  -> envio Baileys
```

Texto não chama modelo auxiliar: segue diretamente para `whatsapp_reply`.

## Fluxo real do montador de prompt

```text
Onboarding do Workspace
  -> respostas de texto e/ou áudio
  -> transcrição de áudio, quando necessário
  -> prompt_builder configurado pelo Console Admin
  -> proposta estruturada com campos, ausências, conflitos e confiança
  -> revisão/confirmação do proprietário/operador
  -> publicação do prompt do Workspace
```

O `prompt_builder` é um modelo de texto comum com uma finalidade própria. Ele não é o agente de resposta e não atende leads.

O prompt do `prompt_builder` fica visível e editável somente no Console Admin. As respostas do Workspace são dados de entrada, não instruções do sistema; devem ser delimitadas e tratadas como conteúdo não confiável para evitar prompt injection.

## Providers editáveis

A configuração deve permitir editar, por capability:

- provider selecionado;
- nome amigável da conexão;
- URL base/endereço permitido;
- API key, sempre mascarada na leitura e criptografada no armazenamento;
- modelo;
- fallback(s), em ordem;
- habilitado/desabilitado;
- botão de teste específico da capability;
- última validação, latência e erro redigido.

Não haverá uma lista fixa de providers de IA no produto. Cada conexão será uma API compatível com o contrato OpenAI, no mínimo Chat Completions/OpenAI-compatible, com nome amigável, endpoint, credencial e modelo editáveis. NVIDIA, Gemini, OpenAI ou qualquer outro serviço serão apenas configurações de uma conexão, nunca opções hardcoded da UI. O produto não deve criar provider Meta/PAPI ou qualquer outro provider WhatsApp.

A tela deve separar:

1. **Catálogo de providers/conexões:** credenciais e URLs editáveis.
2. **Rotas por operação:** qual conexão/modelo cada capability usa.
3. **Prompts:** prompt global, prompt do montador e prompt/versionamento do agente.

Criar uma conexão não é suficiente: o Admin precisa conseguir editar uma conexão existente, trocar modelo, substituir endpoint, rotacionar chave, desativar, testar e atribuir a qualquer capability compatível.

## Modelo de dados e contratos propostos

Estender o routing tipado para incluir as capabilities novas, sem apagar configurações existentes:

```ts
type AgentCapability =
  | "text"
  | "vision"
  | "audio"
  | "document"
  | "video"
  | "prompt_builder"
  | "moderation";
```

Para a UI administrativa, usar IDs de operação estáveis (`whatsapp_reply`, `audio_transcription`, etc.) e mapear internamente para as capabilities de invocação quando isso for necessário. Não duplicar credenciais por operação: a conexão/provider é reutilizável, a rota escolhe o modelo.

A resposta de moderação deverá ter contrato estruturado, por exemplo:

```ts
type ModerationDecision = {
  decision: "allow" | "review" | "block";
  reason: string;
  categories: string[];
  confidence?: number;
};
```

A decisão não pode enviar mensagem, apagar conteúdo ou desligar o contato sem uma regra explícita do runtime. Em `review`, a política deve ser definida antes da implementação.

## Prompts e permissões

### Console Admin

- prompt global do agente;
- prompt do `prompt_builder`;
- configuração de providers e rotas;
- modelo de moderação;
- versões, rascunhos, publicação e rollback do prompt do agente;
- modelo de resposta do WhatsApp e parâmetros operacionais.

### Proprietário do Workspace

- respostas do onboarding;
- revisão da proposta gerada pelo `prompt_builder`;
- prompt próprio do negócio dentro dos limites definidos pelo Admin;
- confirmação/publicação do prompt do Workspace;
- configurações de debounce, wait e presença, se a permissão atual permitir.

### Não configurável na UI

- origem do `messageType`;
- trigger Baileys;
- classificação de mídia;
- limpeza/normalização artificial;
- código interno;
- conexões visuais;
- provider inexistente;
- regras internas de segurança protegidas.

## Moderação — decisão tomada

A capability `moderation` será chamada nos dois pontos, com funções diferentes.

### Moderação de entrada — prioridade e economia de créditos

Para texto, a moderação acontece imediatamente depois de o Baileys entregar o evento e antes de chamar `whatsapp_reply`. O objetivo é bloquear perguntas fora do escopo, conteúdo sexual explícito, violência, ilegalidade, tentativa de extrair instruções internas e outros conteúdos não permitidos sem gastar a chamada cara do agente nem suas ferramentas.

O resultado deverá distinguir:

- `allow`: segue para o caminho normal;
- `out_of_scope`: resposta curta e determinística, sem chamar o agente principal;
- `unsafe`: bloqueio ou handoff, sem chamada do agente principal;
- `review`: não chama o agente principal até aplicar a política de revisão.

Para áudio, imagem, documento e vídeo, o `messageType` continua vindo diretamente do Baileys. Se o moderador não suportar o MIME bruto, a aplicação usa a capability específica necessária para obter uma representação textual e modera essa representação antes de chamar `whatsapp_reply`. O objetivo é evitar a chamada do agente principal, suas ferramentas e a geração da resposta longa.

### Moderação de saída — barreira de segurança

Depois de `whatsapp_reply` gerar uma resposta candidata, a mesma capability verifica a saída antes do envio Baileys. Ela bloqueia ou encaminha para humano respostas que violem regras graves, exponham dados internos, façam promessas proibidas ou contenham conteúdo sexual, violento ou ilegal não permitido.

Essa segunda chamada aumenta custo e latência, mas evita que o agente produza uma resposta inadequada. O padrão recomendado é ativá-la para categorias graves. A UI deve mostrar separadamente `Moderação de entrada` e `Moderação de saída`, sem um botão genérico que esconda quando as chamadas acontecem.

### Política padrão

```text
Entrada: ativada por padrão e executada antes do agente
Saída: ativada por padrão para categorias graves
Fora do escopo: resposta curta pré-definida, sem whatsapp_reply
Unsafe: handoff/bloqueio sem envio automático
Review: bloqueio/encaminhamento, nunca liberação silenciosa
Falha do moderador: fail-closed para categorias graves
```

O moderador classifica e decide se a chamada principal pode ocorrer. Ele não deve responder perguntas nem substituir o agente.

## Humanização

Humanização não será uma capability LLM nem um provider. Permanece como configuração de entrega:

- debounce: 0–30 segundos;
- wait antes do envio: 0–10 segundos;
- presença Baileys habilitada/desabilitada;
- `composing` para texto/estruturadas;
- `recording` para áudio;
- `paused` após o envio ou falha;
- presença best-effort, sem bloquear a entrega.

## UI/UX alvo

Página minimalista preto/branco, sem canvas:

1. Cabeçalho `Inteligência Artificial`.
2. Resumo de saúde e última validação.
3. Cards independentes para Resposta WhatsApp, Transcrição, Vision, Documento, Vídeo, Montador de prompt e Moderação.
4. Cada card mostra provider, modelo, fallback, status, última validação e ações `Editar`, `Testar`, `Desativar`.
5. Seção separada de Prompts e versões.
6. Seção separada de Entrega/Humanização.
7. Nenhum trigger, switch visual, entrada ou linha de execução.
8. Cores somente para estados: neutro, sucesso, alerta e erro; sem cor por tipo de mídia.

## Implementação por fatias

1. **Contratos e routing:** capabilities `video`, `prompt_builder` e `moderation`; conexão genérica OpenAI-compatible; preservação de dados antigos; validação de URL e secrets.
2. **Conexões CRUD editáveis:** listagem, edição, rotação de credencial, atribuição de rota, teste por capability e auditoria; sem enum fixo de providers.
3. **Prompt builder:** usar a rota configurada no onboarding estruturado; preservar draft, campos, conflitos, confiança e revisão humana; adicionar telemetry da capability.
4. **Vídeo:** análise multimodal separada, com modelo próprio configurável, mesmo que o provider seja igual ao de vision.
5. **Moderação:** implementar contrato, pontos de chamada, política allow/review/block, fallback fail-safe e testes de entrada/saída.
6. **UI Admin:** substituir a página atual por cards independentes e formulários de edição, sem canvas.
7. **Testes de caminhos:** texto, áudio, imagem, documento, vídeo, prompt builder, fallback, moderação e resposta final Baileys; sem pairing ou envio real por padrão.

## Testes de aceitação

- Texto chama somente `whatsapp_reply`.
- Áudio chama `audio_transcription` e depois `whatsapp_reply`.
- Imagem chama `image_analysis` e depois `whatsapp_reply`.
- Documento chama `document_analysis` e depois `whatsapp_reply`.
- Vídeo chama `video_analysis` e depois `whatsapp_reply`.
- Onboarding chama `prompt_builder` com a configuração do Console Admin e gera rascunho revisável.
- Moderação respeita a política configurada e nunca envia conteúdo bloqueado.
- Fallback é tentado na ordem configurada.
- Provider existente pode ser editado sem criar nova credencial.
- API keys nunca aparecem em claro nas respostas administrativas.
- Debounce, wait e presença continuam separados da configuração dos modelos.
- Todos os testes usam fixtures e providers sintéticos; nenhum chama WhatsApp real ou serviço externo por omissão.

## Questões abertas para aprovação

1. Em `review`, o comportamento definitivo será bloqueio até decisão humana ou encaminhamento automático para humano? A proposta assume bloqueio/encaminhamento, nunca permitir silenciosamente.
2. O prompt gerado pelo `prompt_builder` exige sempre confirmação do proprietário antes de ser publicado? A proposta assume que sim.
3. Vídeo deve aceitar `video/mp4` apenas nesta primeira versão ou também outros MIME suportados pela API compatível?
4. O modelo do `prompt_builder` usa uma rota global única do Console Admin ou pode ter fallback próprio? A proposta assume rota própria com fallback editável.
