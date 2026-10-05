# Handoff — Agent Hub Canvas e arquitetura de capacidades

**Data:** 5 de outubro de 2026 (UTC−3)  
**Repositório:** `geordptoroy/forte-panel`  
**Checkout de trabalho:** `fix/papi-compatible-interactives`  
**Base observada:** `72406de` (`origin/main` no início desta sessão)

## Objetivo desta sessão

Substituir a página linear de configuração da IA global por uma experiência visual inspirada no canvas do n8n, preservando os contratos actuais enquanto se prepara a evolução para capabilities independentes.

## Implementado

- Adicionada a biblioteca open source MIT `@xyflow/react` para o canvas de nodes.
- Adicionado `gsap` para a entrada dos nodes, com `prefers-reduced-motion` respeitado.
- Criado `client/src/components/PlatformAiCanvas.tsx`.
- A rota `/platform-admin/ai` agora mostra o pipeline visual:
  - Mensagem recebida;
  - Moderação;
  - Texto principal;
  - Ferramentas;
  - Resposta por voz/TTS;
  - Entrega Baileys.
- Cada node abre um popup de configuração.
- A tela mostra conexões, endpoint, modelo, status e ações de testar/excluir.
- O provider não é mostrado como escolha de UX; a implementação actual mantém `openai_compatible` apenas para compatibilidade com o contrato legado.
- O canvas deixa explícito que o modelo declara intenção e que o backend monta o payload final Baileys.

## Decisões funcionais consolidadas

Capabilities devem ser independentes e activáveis/desactiváveis:

- `text` — resposta principal do Workspace e suporte do Console por padrão;
- `moderation` — modelo pequeno especializado, não herdar automaticamente o modelo de texto;
- `prompt_generation` — modelo económico para gerar prompts de Workspace;
- `vision`;
- `stt`/transcrição;
- `tts`/resposta de voz, sujeito a entitlement do plano;
- `documents`;
- `embeddings`, quando a memória semântica entrar no produto.

Quando uma capability estiver desactivada, o pipeline deve saltar para o passo seguinte. Quando um provider falhar, a rota deve seguir a cadeia de fallback configurada ou aplicar uma decisão explícita (`skip`, `text`, `human`, `fail`).

Prompts globais devem ficar no Console Admin, separados de prompts de Workspace, por tópico, com rascunho, publicação, versão, auditoria, impacto e rollback.

## Limitação conhecida desta entrega

O backend actual ainda aceita apenas as capabilities legadas:

- `whatsapp_reply`;
- `audio_transcription`;
- `image_analysis`;
- `document_analysis`;
- `admin_support`.

O canvas já visualiza Moderação, TTS e Tool calling, mas a migration/contrato `AiCapability` ainda precisa ser expandida antes de guardar esses nodes como rotas reais. Não declarar as capabilities novas como operacionais apenas por a UI as mostrar.

O próximo passo técnico é substituir o enum legado por entidades separadas de conexão, modelo, capability e route, sem guardar provider fixo na UX:

```text
connection: URL + auth + encrypted key
model: remote model id + detected capabilities
route: capability + primary model + fallback models + enabled
prompt: global/workspace/capability layers
```

## Payload e agente

O modelo não deve montar envelopes Baileys. Deve produzir um `AgentCommand` validado, por exemplo:

```json
{
  "action": "send_message",
  "messageType": "button",
  "text": "Escolha uma opção",
  "buttons": [{ "id": "agenda", "text": "Agendar" }]
}
```

O compilador no backend deve converter esse comando para o payload Baileys final, incluindo as regras de Pix com/sem valor e compatibilidade Web/Mobile.

## Validação desta sessão

- `pnpm check`: passou.
- `pnpm build`: passou; aviso existente de bundle grande.
- Gateway: TypeScript, 21 ficheiros/106 testes e build passaram.
- Suite root: 98 ficheiros/406 testes passaram e 29 ficheiros foram skipped; 10 testes falharam por incompatibilidades do ambiente Windows (`sha256sum`, `bash`/paths e fixture de evidência de media), não por erros do canvas. Reexecutar no CI Linux antes de declarar release verde.
- `git diff --check`: passou.

## Próxima sessão recomendada

1. Expandir schema/migrations para `aiConnections`, `aiModels`, `aiCapabilityRoutes` e `globalPrompts` versionados.
2. Implementar `/models` e fallback manual de catálogo.
3. Criar adapters internos `openai_chat`, `gemini_native` e `anthropic_messages`, invisíveis na UX.
4. Adicionar capability `moderation` com modelo leve e política fail-closed configurável.
5. Adicionar TTS com entitlement por plano, quota e fallback para texto.
6. Criar prompt generator com revisão humana antes de publicar.
7. Migrar o popup do canvas para editar rotas reais e toggles de enabled/fallback.
8. Criar `AgentCommand`/compiler e retirar `enviar_interativo` gigante do tool schema.
9. Adicionar testes de contrato para texto, moderação, prompt generation, TTS, botões, Pix, agendamento e desactivação/fallback.
10. Reexecutar gates Linux/CI, actualizar `docs/STATUS-ATUAL.md`, e só então publicar imagens.

## Bibliotecas

- `@xyflow/react` — canvas node-based open source (MIT), usado nesta entrega.
- `gsap` — animações de entrada e estados, com reduced motion.
- Radix UI já existente no projecto deve ser usado para os próximos dialogs, tabs, switches e tooltips.
- Capybara foi analisado, mas o projecto não possui stack Ruby; manter `data-testid` estáveis e usar a stack de testes React/TypeScript existente até existir um harness Ruby oficial.
