

## Mensagens interativas Baileys — 2026-09-29

O composer da Inbox agora permite alternar entre texto, botões, lista e enquete. Botões aceitam até três opções; listas usam seções/linhas e enquete usa opções separadas por linha. Para carousel, selecione **Carousel (JSON Baileys)** e informe o objeto `carouselMessage` nativo dentro do `InteractiveMessage`; o backend valida a estrutura e envia pelo relay do socket, sem converter para texto.

A validação automatizada cobre o backend e o gateway. O teste operacional do carousel deve usar um payload gerado pela versão instalada do Baileys, porque os cards podem carregar `imageMessage` preparado pelo próprio protocolo e não devem ser inventados como URLs simples.
