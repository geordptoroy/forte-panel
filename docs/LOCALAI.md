# LocalAI na stack Forte Panel

O Compose inclui um único serviço LocalAI (`localai/localai:v4.11.0`) para inferência local de áudio e embeddings. A imagem oficial foi confirmada para `amd64` e `arm64`. O Compose de produto mantém a API sem portas publicadas no host; o Compose local disponibiliza a WebUI apenas em `127.0.0.1`, sem a expor à rede local nem à Internet.

## Modelos e recursos

- **Whisper:** `whisper-base`, backend `whisper`, com o peso `ggml-base.bin` definido em [`localai/whisper-base.yaml`](../localai/whisper-base.yaml). O artefacto é obtido do repositório upstream num commit fixo; o preset de galeria utilizado anteriormente não incluía ficheiros de pesos.
- **Embeddings:** `qwen3-embedding-4b`, pré-carregado pela galeria LocalAI. O Forte Panel pede `dimensions: 2048`; como o LocalAI `v4.11.0` devolveu 2560 dimensões nos testes, o adapter usa a capacidade MRL oficial do Qwen para truncar o prefixo a 2048 e aplicar normalização L2 antes de persistir. A conversão fica limitada ao ID exato `qwen3-embedding-4b`; qualquer outro modelo LocalAI tem de devolver exatamente 2048 dimensões. Não há substituição automática por outro modelo. Referências: [MRL Qwen3](https://github.com/QwenLM/Qwen3-Embedding) e [dimensões no LocalAI](https://localai.io/docs/features/embeddings/).
- O serviço tem limite de **1,5 CPU e 6 GiB de RAM** e guarda os modelos no volume `forte_localai_models`. O primeiro arranque descarrega os pesos; pode demorar e usar vários GiB de disco/rede. Estes limites podem ser ajustados no Compose após medições da VM.
- O script oficial `scripts/start-docker.ps1` inclui LocalAI no `pull` e `up`. A atualização normal preserva o volume de modelos; o reset destrutivo apaga-o juntamente com os outros dados da stack.

## WebUI local e instalação manual

Na stack local, abre [http://localhost:8080](http://localhost:8080) no mesmo PC. A porta é vinculada a `127.0.0.1` (pode ser alterada com `LOCALAI_UI_PORT`, se 8080 já estiver ocupada). Na WebUI, acede a **Models → Explore** para pesquisar e instalar modelos da galeria; em **Models → Installed** podes gerir os instalados. Também é possível importar configurações/modelos pela página **Import Model**. Consulta a [documentação oficial da instalação de modelos](https://localai.io/docs/getting-started/models/) e da [Model Gallery](https://localai.io/docs/models/).

O preload automático de **`whisper-base`** e **`qwen3-embedding-4b`** mantém-se; a interface serve para adicionar modelos. As instalações adicionais ficam no mesmo volume persistente `forte_localai_models`. O Compose de produto não publica a WebUI; não alterar o bind para `0.0.0.0` nem encaminhar esta porta diretamente para a Internet.

## Configuração no Console Admin

Defina `LOCALAI_API_KEY` no `.env` local com um segredo aleatório forte. **Não use o valor de exemplo.** O mesmo segredo deve ser introduzido no campo API key de cada conexão LocalAI:

| Capability | Base URL | Model |
| --- | --- | --- |
| Transcrição de áudio | `http://local-ai:8080/v1` | `whisper-base` |
| Embeddings | `http://local-ai:8080/v1` | `qwen3-embedding-4b` |

O teste administrativo de áudio envia um WAV sintético de silêncio e aceita transcrição vazia; não usa gravações reais. No fluxo de mensagens, os bytes vêm de media privada validada (data URL com limite de 8 MiB ou chave de objeto persistido), nunca de um URL arbitrário fornecido pelo cliente. Os outros tipos de modelo continuam a usar as conexões configuradas no Console Admin.

## Segurança e validação

- A exceção HTTP para LLM fica limitada a `openai_compatible` e ao URL interno exato `http://local-ai:8080/v1`; hosts/IPs privados arbitrários continuam bloqueados pela proteção SSRF.
- A API key é guardada encriptada na ligação do Console Admin e enviada como Bearer. O container recebe a mesma chave através do ambiente Compose.
- O Compose local publica apenas a WebUI no loopback do próprio host; a API permanece na rede interna Docker e o Compose de produto não publica a porta. Validar Compose, testes, build e comportamento de migração antes de qualquer atualização da instalação real, merge ou publicação.
