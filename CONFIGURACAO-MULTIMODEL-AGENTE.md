# Configuração multimodelo do agente

O agente do Forte Panel não coloca chaves de modelos no `.env`. O `.env` fica reservado para a infraestrutura, PAPI, banco, autenticação e segredos de webhook. As credenciais de IA são cadastradas em **Sistema → Configuração da empresa → Agente nativo**.

## Provedores disponíveis

### NVIDIA NIM
Use para conversa e geração de texto, aproveitando o free tier da NVIDIA.

- Provedor: `NVIDIA NIM`
- URL padrão: `https://integrate.api.nvidia.com/v1`
- Chave: sua chave da NVIDIA
- Modelo: o ID exato exibido pela NVIDIA, por exemplo `meta/llama-3.1-70b-instruct`

### Google Gemini
Use para imagens, áudio e documentos/PDFs. O Panel usa o endpoint compatível com OpenAI e mantém a chave somente no PostgreSQL criptografada com o `JWT_SECRET` da instalação.

- Provedor: `Google Gemini`
- URL padrão: `https://generativelanguage.googleapis.com/v1beta/openai`
- Chave: sua chave da API Google AI
- Modelo: o ID disponível na sua conta, por exemplo `gemini-2.0-flash`

### Outro OpenAI-compatible
Serve para OpenAI, OpenRouter, Azure-compatible ou outro endpoint que aceite `/v1/chat/completions`.

- Provedor: `Outro OpenAI-compatible`
- URL base: endpoint do provedor
- Chave: chave desse provedor
- Modelo: ID exato do modelo

## Roteamento por capacidade

A interface possui um modelo separado para cada tipo de entrada:

| Capacidade | Uso | Exemplo de escolha |
|---|---|---|
| Texto | Conversa normal e respostas | NVIDIA NIM + Llama |
| Imagem | Fotos enviadas pelo cliente | Google Gemini |
| Áudio | Áudios/voz recebidos | Google Gemini ou transcrição dedicada |
| Documentos | PDFs e documentos | Google Gemini |

O worker identifica o `messageType` recebido da PAPI e escolhe automaticamente a rota correspondente. Assim, não é necessário usar o mesmo modelo para tudo.

## Segurança

- A chave não é devolvida à interface em texto aberto.
- O formulário mostra apenas uma versão mascarada da chave existente.
- Se o campo mascarado não for alterado, a chave criptografada anterior é preservada.
- As credenciais ficam por workspace na tabela `workspaceSettings`.
- O `JWT_SECRET` deve ser forte e permanente: se ele for trocado, os segredos criptografados antigos não poderão ser descriptografados.
- O `.env` não recebe chaves de NVIDIA, Google ou outros modelos.

## Comportamento quando uma capacidade não está configurada

A mensagem continua sendo registrada no PostgreSQL. O worker marca o processamento como falho e aplica retry; não inventa resposta nem envia conteúdo por outro provedor sem que isso esteja configurado. Portanto, configure cada rota que pretende usar antes de ativar mensagens multimodais.

## Documentação do projeto

As decisões de arquitetura e os comandos de atualização continuam documentados em `ATUALIZACAO-STACK-DESENVOLVIMENTO.md`. Esta separação permite adicionar futuramente transcrição dedicada, OCR, embeddings, busca semântica e modelos especializados mantendo o processamento no agente nativo.
