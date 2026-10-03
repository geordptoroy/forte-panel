# Auditoria reversa da PAPI 1.5.1 para o Forte Panel

**Data:** 2026-10-02  
**Escopo:** inspeção da imagem `intrategica/papi-free:1.5.1`, sem adicionar a PAPI, seus nodes, API, dependências ou provedor ao Forte Panel.

## 1. Conclusão executiva

A PAPI não depende de um formato único para todos os tipos de mensagem:

- **Texto, mídia, localização, contato e sticker:** `socket.sendMessage(jid, content)`.
- **Botões modernos:** `socket.relayMessage(jid, { interactiveMessage }, {})`.
- **Listas legadas:** `socket.relayMessage(jid, { listMessage }, {})`.
- **Enquetes:** `socket.sendMessage(jid, { poll: ... })`.
- **Carrossel:** prepara mídia com `prepareWAMessageMedia` e usa um envelope de carrossel gerado pelo helper da própria PAPI.
- **Produtos:** usa os métodos de catálogo do Baileys, não é uma simples mensagem de texto.

A correção dos botões aplicada ao Forte removeu o wrapper `viewOnceMessage` e passou a enviar o `interactiveMessage` diretamente. Isso reproduz a chamada moderna confirmada na PAPI.

A falha dos anexos do Forte é independente dos botões: a PAPI aceita `url` ou `base64` diretamente; o Forte atualmente interrompe o fluxo antes do gateway quando o storage privado falha (`INBOX_MEDIA_STORAGE_FAILED`).

A falha do áudio também tem duas camadas distintas:

1. **Navegador:** `getUserMedia`/permissão do microfone e gravação.
2. **Gateway:** envio de bytes/base64 com `ptt: true` e MIME compatível, normalmente `audio/ogg; codecs=opus`.

## 2. Contrato de instâncias

### Persistência

A PAPI mantém um mapa de instâncias em memória e persiste a autenticação por `instanceId` em uma destas estratégias:

- arquivos por instância (`sessions/<id>`);
- PostgreSQL por instância;
- PostgreSQL com cache Redis.

As configurações da instância ficam separadas da autenticação, em configuração persistida por `instance_id`.

### Criação e restauração

Ao iniciar:

1. inicializa o storage;
2. inicializa a fila se Redis estiver disponível;
3. lista as sessões persistidas;
4. recria cada instância com seu próprio `id`;
5. abre um socket independente por instância.

A criação de uma instância recebe `id` e nome opcional. A reconexão não cria uma sessão diferente: reutiliza o mesmo `id` e o mesmo estado de autenticação.

### Configurações Baileys observadas

A PAPI configura, entre outros:

- `connectTimeoutMs: 30000`;
- `keepAliveIntervalMs: 30000`;
- `qrTimeout: 45000`;
- `retryRequestDelayMs: 350`;
- `maxMsgRetryCount: 4`;
- `fireInitQueries: true`;
- `markOnlineOnConnect` configurável;
- `syncFullHistory` configurável;
- `generateHighQualityLinkPreview: true`;
- `emitOwnEvents: false`.

### Reconexão

- logout voluntário não reconecta automaticamente;
- outras desconexões entram numa fila;
- usa backoff exponencial com jitter;
- limita reconexões simultâneas a 3;
- após 5 tentativas, marca a instância como `FAILED`;
- envia eventos de `reconnecting`, `failed` e `logged_out`.

Esse desenho é relevante para o erro anterior de lock: uma instância deve possuir **um único socket ativo por `instanceId`**, e o caminho de reconexão precisa ser serializado.

## 3. Contrato de destinatário

Antes do envio, a PAPI:

1. aceita JID completo ou número;
2. pode validar o número com `socket.onWhatsApp`;
3. ignora validação para grupos, broadcast e `@lid`;
4. resolve o JID alternativo com `resolveJid`;
5. envia sempre para o JID resolvido.

O Forte deve manter essa regra, especialmente para `@lid`, grupos e números que possuem JID alternativo.

## 4. Payloads de envio

### Texto

```ts
await socket.sendMessage(jid, {
  text: texto,
})
```

Valida `jid` e texto. Retorna `messageId`, `remoteJid` e timestamp.

### Imagem

Aceita URL ou base64:

```ts
await socket.sendMessage(jid, {
  image: url ? { url } : Buffer.from(base64, "base64"),
  caption,
  mimetype: mimetype || "image/jpeg",
})
```

### Vídeo

```ts
await socket.sendMessage(jid, {
  video: url ? { url } : Buffer.from(base64, "base64"),
  caption,
  gifPlayback,
  mimetype: mimetype || "video/mp4",
})
```

### Áudio comum ou PTT

```ts
await socket.sendMessage(jid, {
  audio: url ? { url } : Buffer.from(base64, "base64"),
  ptt: ptt ?? true,
  mimetype: mimetype || "audio/ogg; codecs=opus",
})
```

Pontos importantes:

- `ptt: true` é o que faz o áudio aparecer como mensagem de voz;
- para PTT nativo, o bytes precisam ser compatíveis com OGG/Opus;
- a PAPI aceita base64 diretamente, sem exigir um bucket externo;
- o conversor de áudio existe na PAPI para transformar formatos recebidos via integração em OGG/Opus antes do envio.

### Documento

```ts
await socket.sendMessage(jid, {
  document: url ? { url } : Buffer.from(base64, "base64"),
  fileName: filename || "document",
  mimetype: mimetype || "application/octet-stream",
})
```

### Sticker

```ts
await socket.sendMessage(jid, {
  sticker: url ? { url } : Buffer.from(base64, "base64"),
})
```

### Localização

```ts
await socket.sendMessage(jid, {
  location: {
    degreesLatitude: latitude,
    degreesLongitude: longitude,
    name,
    address,
  },
})
```

### Contato

A PAPI cria um vCard:

```text
BEGIN:VCARD
VERSION:3.0
FN:nome
TEL;type=CELL;type=VOICE;waid=numero:telefone
END:VCARD
```

E envia:

```ts
await socket.sendMessage(jid, {
  contacts: {
    displayName: nome,
    contacts: [{ vcard }],
  },
})
```

### Reação

```ts
await socket.sendMessage(jid, {
  react: {
    text: emoji,
    key: { remoteJid: jid, id: messageId },
  },
})
```

### Enquete

```ts
await socket.sendMessage(jid, {
  poll: {
    name,
    values: opcoes,
    selectableCount: selectableCount || 1,
  },
})
```

A PAPI exige entre 2 e 12 opções.

### Botões modernos

A implementação funcional observada monta:

```ts
const messageContent = {
  interactiveMessage: {
    body: { text: texto },
    footer: rodape ? { text: rodape } : undefined,
    nativeFlowMessage: {
      buttons: botoes.map((button) => ({
        name: "quick_reply",
        buttonParamsJson: JSON.stringify({
          display_text: button.displayText,
          id: button.id,
        }),
      })),
      messageVersion: 1,
    },
  },
}

await socket.relayMessage(jid, messageContent, {})
```

O Forte agora segue esse envelope direto. Não deve envolver o conteúdo em `viewOnceMessage` para esse caso.

### Listas

A PAPI usa o formato legado:

```ts
await socket.relayMessage(jid, {
  listMessage: {
    title,
    description: texto,
    footerText: rodape,
    buttonText,
    sections,
  },
}, {})
```

A estrutura das seções contém linhas com identificador, título e descrição. Esse fluxo é diferente de `nativeFlowMessage` e não deve ser misturado automaticamente.

### Carrossel

A PAPI:

1. recebe cards com título, subtítulo, corpo, rodapé e botões;
2. baixa/prepara a imagem ou vídeo de cada card via `prepareWAMessageMedia`;
3. usa `socket.waUploadToServer` para carregar a mídia no servidor do WhatsApp;
4. injeta o `imageMessage` ou `videoMessage` preparado no card;
5. envia o envelope de carrossel gerado pelo helper da PAPI.

Esse tipo deve ser tratado como uma fatia independente, pois possui envelope próprio e não é equivalente a uma sequência de mensagens.

### Produtos e catálogo

A PAPI não monta manualmente a mídia do produto. Usa operações de catálogo do socket, incluindo consulta de catálogo, criação/atualização de produto, coleções e envio de produto/multi-produto. Isso só deve ser aplicado ao Forte quando o catálogo WhatsApp estiver modelado e autorizado no workspace.

## 5. Fila e envio unificado

A PAPI possui `sendMessageUnified`:

- verifica se a instância está conectada;
- decide entre envio direto e Redis;
- registra `type`, `to`, `payload`, prioridade e máximo de tentativas;
- usa até 3 tentativas por mensagem;
- processa o mesmo dispatcher no caminho direto e no worker;
- retorna `messageId` quando envia diretamente;
- retorna `queueId` quando enfileira.

A fila suporta texto, imagem, vídeo, áudio, documento, sticker, localização, contato, botões e lista. A implementação do Forte deve evitar que o caminho da fila tenha payload diferente do caminho direto.

## 6. Mídia recebida

A PAPI trata mídia recebida com `downloadMediaMessage` e `reuploadRequest: socket.updateMediaMessage`.

Tipos reconhecidos:

- `imageMessage`;
- `videoMessage`;
- `audioMessage`;
- `documentMessage`;
- `stickerMessage`;
- mensagem de voz (`pttMessage`) como áudio.

Fluxo:

1. ignora newsletter/broadcast sem `mediaKey`;
2. verifica se existe `mediaKey`;
3. baixa o conteúdo para `Buffer`;
4. lê MIME e nome do arquivo;
5. usa um nome derivado quando o WhatsApp não fornece nome;
6. disponibiliza base64, MIME e filename para webhook/WebSocket.

O Forte não precisa copiar o modelo de base64 para mensagens recebidas se quiser manter storage privado, mas precisa ter um caminho local equivalente para o envio sair mesmo quando o provider de storage não estiver configurado.

## 7. O que explica os problemas atuais do Forte

### Anexos

O log do Forte já identifica a causa:

```text
INBOX_MEDIA_STORAGE_FAILED
```

A PAPI não passa por essa barreira: o endpoint aceita o conteúdo como base64 ou URL e o dispatcher converte base64 diretamente para `Buffer`.

**Aplicação recomendada no Forte:**

- manter storage privado para persistência e histórico;
- permitir um caminho transitório de envio com `Buffer`/base64 quando o arquivo acabou de ser recebido;
- não registrar credenciais reais;
- retornar erro técnico específico somente se ambos os caminhos falharem.

### Áudio

O navegador precisa obter o stream por `navigator.mediaDevices.getUserMedia({ audio: true })`. Depois da gravação, o frontend deve enviar o blob para o backend, que precisa:

1. ler os bytes;
2. preservar ou converter para OGG/Opus;
3. enviar com `audio`, `ptt: true` e `mimetype: audio/ogg; codecs=opus`.

A permissão do navegador e o envio pelo Baileys são problemas independentes; corrigir o payload não cria o popup de permissão.

### Botões e listas

O Forte tinha três riscos:

- botão de envio desabilitado quando não havia texto livre;
- wrapper `viewOnceMessage` incompatível com o caminho comprovado;
- mistura entre contrato moderno de botões e contrato legado de listas.

O primeiro e o segundo já foram corrigidos. A lista ainda deve ser validada usando `listMessage` legado ou um contrato nativo específico, sem assumir que o envelope de botões serve para ambos.

## 8. Plano de aplicação no Forte, uma fatia por vez

### Fatia 1 — concluída

- envelope direto de `interactiveMessage` para botões;
- testes unitários do payload;
- CI e imagem `dev` publicados no commit `758af48`.

### Fatia 2 — próximo código recomendado: envio de mídia sem provider obrigatório

- criar um resolver único de mídia: URL, data URL ou base64;
- converter para `Buffer` no gateway;
- enviar imagem, vídeo, áudio e documento usando os mesmos campos da PAPI;
- preservar storage privado como persistência opcional, sem bloquear o envio transitório;
- adicionar testes do dispatcher para cada MIME e tipo.

### Fatia 3 — áudio/PTT

- validar o MIME real do blob gravado;
- converter somente quando necessário para OGG/Opus;
- enviar `ptt: true` por padrão para gravação de voz;
- separar claramente gravação do navegador, upload e envio no diagnóstico.

### Fatia 4 — listas e enquetes

- lista via `relayMessage({ listMessage })` ou contrato nativo testado separadamente;
- enquete via `sendMessage({ poll })`;
- validar opções e retorno de `messageId`.

### Fatia 5 — ciclo de instâncias

- garantir um socket por `instanceId`;
- serializar connect/reconnect;
- persistir autenticação isolada por instância;
- expor estados `CONNECTING`, `QR_READY`, `CONNECTED`, `RECONNECTING`, `FAILED` e `DISCONNECTED`;
- manter `CORE_ONLY_MODE = true`.

### Fatia 6 — carrossel e catálogo

Implementar somente depois que os tipos básicos, mídia, áudio e interativos estiverem estáveis.

## 9. Limites da auditoria

A imagem contém componentes específicos da PAPI, inclusive helpers próprios e integrações externas. Foram usados apenas os contratos de comportamento e os formatos públicos do Baileys necessários para o Forte. Não serão copiados:

- API PAPI;
- nodes PAPI;
- integração PapiZAI;
- estrutura de licença;
- footer/créditos;
- código de negócio ou persistência específico da PAPI;
- dependências ou imagens da PAPI no Forte.
