# Configuração da IA por operação

**Estado:** configuração atual do Forte Panel
**Tela:** `Sistema → APIs por operação`

## Princípio

As credenciais de IA não ficam no `.env` do cliente. O `.env` é reservado para infraestrutura, banco, autenticação, Baileys e segredos de webhook.

A interface não impõe NVIDIA, Gemini, OpenAI ou qualquer outro catálogo. Cada operação recebe três valores livres:

1. **URL da API**;
2. **API key**;
3. **Modelo**.

O endpoint precisa aceitar o contrato de chat usado pelo agente, normalmente `/v1/chat/completions`, além do formato multimodal necessário à operação.

## Operações disponíveis

| Tela | Uso | Conteúdo enviado ao modelo |
|---|---|---|
| **API de texto** | Conversa, ferramentas, agenda e respostas | Mensagens de texto e histórico |
| **API de imagem** | Fotos, comprovantes e imagens recebidas | Texto + `image_url` |
| **API de áudio** | Mensagens de voz | Texto + `file_url` ou transcrição, conforme o endpoint |
| **API de documento** | PDFs e arquivos | Texto + `file_url` |

Cada rota é independente. Uma API de imagem quebrada não deve substituir silenciosamente a API de texto nem gerar uma resposta inventada.

## Como o runtime escolhe a operação

1. O Baileys recebe a mensagem.
2. O gateway identifica `messageType`.
3. O Panel persiste a mensagem e seus metadados.
4. O worker escolhe a rota correspondente:
   - `text` → API de texto;
   - `image` → API de imagem;
   - `audio` → API de áudio;
   - `document`/`pdf` → API de documento.
5. A resposta do agente entra na fila outbound e retorna pelo canal WhatsApp ativo.

## Segurança

- API keys são criptografadas em repouso com AES-256-GCM.
- A interface recebe apenas uma versão mascarada.
- Se uma chave mascarada não for alterada, a chave criptografada anterior é preservada.
- As credenciais pertencem ao workspace.
- `JWT_SECRET` deve ser forte e permanente; trocá-lo impede a leitura dos segredos antigos.
- API keys nunca entram no prompt, no bundle do navegador, em logs ou em auditoria sem sanitização.

## Requisitos por endpoint

O operador deve confirmar, para cada URL:

- autenticação `Bearer` ou equivalente;
- rota de chat compatível;
- suporte ao modelo escolhido;
- suporte a imagem, áudio ou documento quando aplicável;
- limite de tamanho e formato de arquivo;
- timeout e política de retenção do serviço.

O Forte Panel não valida a existência do modelo remoto ao salvar a configuração. A tela oferece **Testar conexão** por operação: faz uma chamada mínima, sem salvar a configuração e sem enviar mensagem ao WhatsApp, e informa sucesso, latência ou erro sanitizado. Essa chamada pode consumir uma pequena unidade de quota/custo do serviço remoto.

## Pendências conhecidas

- Estados de erro acionáveis quando uma rota está incompleta ou indisponível.
- Transcrição dedicada para endpoints que não aceitam áudio diretamente.
- OCR e extração de documentos com limites de tamanho.
- Storage privado de mídia com URL assinada; o MVP atual transporta mídia em data URL.
- Versionamento, publicação e rollback da configuração do agente.

Consulte [`AUDITORIA-DOCUMENTACAO-E-ROADMAP-2026-09-26.md`](./AUDITORIA-DOCUMENTACAO-E-ROADMAP-2026-09-26.md) para a sequência completa de implementação.
