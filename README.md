# agents — a corte de Maquiavel

Uma corte de agentes para o OpenCode V2. **Maquiavel**, chanceler, entrevista e
forja criados de ofício (`tomas-vedor`, `beatriz-escrivao`), todos falando
português arcaico leve. Cada criado tem quatro atributos vivos — vida, honra,
experiência e dinheiro — guardados em um livro JSON e movidos por uma fórmula
determinística.

## Como funciona

```
agents/
├── maquiavel.md                  # o chanceler (agente primary)
├── reference/
│   ├── estilo-corte.md           # a voz comum
│   ├── oficios.md                # elenco, nomes, cores, licenças
│   ├── formato-agente-v2.md      # schema V2, contra campo inventado
│   └── corte-e-honra.md          # as leis dos atributos
├── corte/
│   ├── corte.mjs                 # fórmulas + livro (único escritor)
│   ├── corte.exemplo.json        # forma do livro
│   └── plugin/index.ts           # medidor do OpenCode
└── opencode.exemplo.jsonc        # trecho para o config global
```

O fluxo é este:

1. Você fala com o Maquiavel e descreve o criado que quer.
2. Ele entrevista, propõe o arquivo inteiro e espera sua aprovação.
3. Ele grava `.opencode/agents/<nome>-<oficio>.md` e registra o criado no livro.
4. O plugin mede tokens e custo reais de cada sessão, paga experiência e debita
   dinheiro automaticamente.
5. A cada pedido, ele injeta uma linha com os atributos no alto do system
   prompt: `【Corte】Tomas, o Vedor — vida 94 · honra 23 · ...`.
6. Elogio e censura movem a honra. Honra alta rende tença diária.

## Instalação

```bash
# 1. agente global
cp maquiavel.md ~/.config/opencode/agents/maquiavel.md

# 2. núcleo, plugin e referências
mkdir -p ~/.config/opencode/maquiavel
cp -r corte/corte.mjs corte/corte.exemplo.json corte/plugin reference ~/.config/opencode/maquiavel/

# 3. livro da corte, com Maquiavel nascido
node ~/.config/opencode/maquiavel/corte.mjs nascer maquiavel \
  --nome Maquiavel --oficio Chanceler --baseline 6000

# 4. registrar o plugin no config global (ver opencode.exemplo.jsonc)
```

`~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["C:/Users/cesar/.config/opencode/maquiavel/plugin"]
}
```

Reinicie o serviço (`opencode service restart`) para o OpenCode reler agentes e
plugin.

## Uso

Escolha **Maquiavel** na lista de agentes e peça:

> Quero um criado que revise minhas mudanças antes de eu commitar.

Consulta da corte, a qualquer momento:

```bash
node ~/.config/opencode/maquiavel/corte.mjs ver
```

## Os quatro atributos

Nascem todos com **100 de vida, 0 de honra, 0 de experiência, 50 de dinheiro**.
Faixa 0–100.

### Honra

Movida por elogio e censura, interpretados pelo Maquiavel.

```
elogio:   +ceil(peso × 5 × (1 − honra/100))     peso 1..3
censura:  −ceil(peso × 4 × (0,5 + honra/100))
```

Subir é lento, cair é rápido — e quanto maior a altura, maior a queda.

### Experiência

Mede perícia, não gasto: eficiência contra o próprio histórico.

```
T = input + output + reasoning + cache.write + 0,25 × cache.read
E = clamp(B / T, 0,4 .. 2,0)
B = mediana das 5 últimas corridas aceitas (ou o baseline do ofício)
ganho = round(8 × E × q × (1 − exp/100))        q = 1 | 0,6 | 0
perda = 20 × (0,6 − E)  quando E < 0,6
```

Rejeição (`q = 0`) custa 6 de experiência. Dentro de 24 h, o ganho provisório
pode ser revogado.

### Dinheiro

Um ponto por cêntimo de dólar real, com troco acumulado.

```
débito = floor(troco + custo_usd × 100)
tença diária = 3 (<20 honra) · 6 (<60) · 9 (<90) · 12 (≥90)
```

Bolsa 0–9: falido, não aceita trabalho. Gasto estimado acima de 10 pontos exige
licença do soberano.

### Vida

| Ato | Efeito |
|---|---|
| Ferida leve / grave / mortal | −3 / −10 / −30 |
| Quebra de lei da corte | −5 |
| Mentir na conta | −15 e honra −10 |
| Descanso | +15 |
| Vida 0 | interdito, até o soberano reviver |

Tetos diários: ±30 honra, ±25 experiência, ±30 vida, +30 dinheiro que entra.

## Comandos do livro

```bash
node corte.mjs ver [id] [--json]
node corte.mjs nascer <id> --nome N --oficio O [--baseline 8000]
node corte.mjs elogiar <id> --peso 1..3
node corte.mjs censurar <id> --peso 1..3
node corte.mjs ferir <id> --grau leve|grave|mortal|lei|mentira
node corte.mjs descanso <id>
node corte.mjs soldo <id> --pontos N
node corte.mjs multar <id> --pontos N
node corte.mjs reviver <id>
node corte.mjs interditar <id>
node corte.mjs desfazer <id>
node corte.mjs tenca
```

## Segurança

- O livro tem **um único escritor**: `corte.mjs`. Nenhum agente edita o JSON.
- A tool `corte` recusa qualquer ação que não seja `ver` quando quem chama não é
  o Maquiavel — verificado em código, não em prompt.
- O plugin nunca derruba sessão: falhas vão para `~/.config/opencode/maquiavel/erros.log`.
- Toda mudança de atributo fica no histórico com autor, motivo e antes → depois.

## Depuração

```bash
CORTE_DEBUG=1 opencode service restart   # loga payloads de hook
tail ~/.config/opencode/maquiavel/erros.log
node corte.mjs ver --json
```

Se o plugin não carregar, a corte continua funcionando pelos comandos do livro;
o Maquiavel avisa quando o registro falha.

## Atualizar a voz

A voz tem fonte única: `reference/estilo-corte.md`. Mudou ali, reforge os criados
existentes — não corrija um por um.
