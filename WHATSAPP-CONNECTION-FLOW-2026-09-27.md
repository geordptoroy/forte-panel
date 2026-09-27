# Fluxo de Conexão WhatsApp — Baileys

## Decisão de produto

A conexão do WhatsApp passa a ser a **primeira etapa operacional do workspace**. Nenhum teste de recebimento, resposta automática, agendamento ou processamento deve ser interpretado como válido antes de uma sessão Baileys conectada e identificada.

## Ordem oficial do MVP

1. Criar conta e entrar no workspace.
2. Abrir **Conectar WhatsApp**.
3. Conferir a configuração operacional da instância:
   - código/instance ID;
   - nome amigável;
   - gateway/base URL;
   - autenticação da API mascarada;
   - webhook configurado;
   - sessão persistente e criptografia;
   - estado atual e número conectado.
4. Gerar ou atualizar o QR Code.
5. Ler o QR pelo WhatsApp em **Dispositivos conectados**.
6. Confirmar o estado `connected` e o número conectado.
7. Somente depois validar, nesta ordem:
   - recebimento inbound;
   - persistência na Inbox;
   - processamento do worker;
   - execução do agente;
   - fila outbound;
   - envio pelo Baileys;
   - agenda e automações.

## Estado atual auditado

O gateway Baileys já possui QR, reconexão, sessão persistente, outbox de webhook, envio e endpoints protegidos. Porém:

- o `instanceId` ainda é definido por variável de ambiente do gateway;
- a tela atual mistura conexão com consumo e proteções em `Integrações`;
- não existe uma página operacional dedicada para o primeiro passo;
- o Panel exibe o código da instância, mas não apresenta uma ficha clara de configuração;
- conexão e pipeline de mensagens ainda precisam ser validados separadamente.

## Limites de segurança

- API keys e segredos nunca aparecem em texto claro.
- O QR só é servido para usuário autenticado e autorizado.
- A conexão/desconexão exige perfil gerencial.
- O backend continua sendo a fonte de verdade; esconder o botão no frontend não é autorização.
- A configuração exibida no Panel representa o ambiente efetivamente em execução. Alterações de segredo ainda exigem atualização controlada do ambiente e restart do gateway.

## Próxima implementação

Primeiro separar a rota e a navegação de conexão. Depois adicionar a ficha operacional mascarada da instância. Só após validar essa etapa será iniciado o fluxo de inbound/outbound.
