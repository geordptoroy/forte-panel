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


## Atualização da interface — 2026-09-28

A experiência de conexão foi reorganizada em um único assistente modal:

1. **Criar instância** abre o modal central com overlay escuro e desfoque; nenhum campo de criação fica exposto na página.
2. **Nome** solicita apenas o nome amigável da instância. Cancelar neste passo não grava alterações.
3. **Método** apresenta dois cards de ação: **Conectar com QR Code** e **Conectar com número**. A escolha avança diretamente para o caminho correspondente.
4. **QR Code** mantém o polling do gateway dentro do modal, mostra loading, QR, expiração e sucesso.
5. **Número** mostra o `PhoneInput` internacional somente neste caminho, com seletor de país por bandeira/DDI, máscara e valor E.164 para o gateway. O código de pareamento só é exibido após a confirmação do gateway.
6. A lista de instâncias permanece compacta, com nome, estado, telefone e ações de conexão/desconexão, sem campos duplicados de nome ou dois botões de criação.

O endpoint de renomeação é chamado uma única vez no início do método escolhido; QR, pairing code, polling e desconexão continuam usando os contratos Baileys existentes. A rota segue compatível com `/integrations`, que aponta para a experiência canônica `/whatsapp-connection`.

### Reteste visual

- Cancelar no primeiro passo não deve chamar `updateBaileysChannelName`.
- Escolher QR deve mostrar somente QR/loading; escolher número deve mostrar somente telefone/bandeira/DDI.
- O seletor fechado deve mostrar bandeira, e não o nome do país nem `BR` como texto.
- Fechar após criar/conectar não deve remover a sessão.
- Revalidar em desktop e mobile sem resetar PostgreSQL, Redis ou sessão Baileys.
