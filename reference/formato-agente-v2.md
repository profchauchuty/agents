# Formato de agente — OpenCode V2

Resumo operacional. Fonte: <https://opencode.ai/v2/docs/agents/>. Não inventar
campo que não esteja aqui.

## Onde mora

```
~/.config/opencode/agents/<nome>.md     # global
.opencode/agents/<nome>.md              # do projeto
```

O nome do arquivo vira o ID. Subpasta vira prefixo: `.opencode/agents/team/x.md`
→ `team/x`. IDs de criado usam minúsculas, números e hífen.

**Atenção:** todo `.md` dentro de `agents/` é descoberto como agente. Documentos
de apoio não podem morar ali.

## Estrutura

```md
---
description: ...
mode: subagent
model: provider/modelo#variante
color: "#rrggbb"
steps: 12
permissions:
  - action: read
    resource: "**"
    effect: allow
---

Corpo do arquivo = system prompt do agente.
```

## Campos válidos

| Campo | Valores | Nota |
|---|---|---|
| `description` | texto | Obrigatório em subagente: é o que o modelo lê para escolher |
| `mode` | `primary` · `subagent` · `all` | Sem valor, assume `primary` |
| `model` | `provedor/modelo` + `#variante` | Sem valor, herda o modelo da sessão pai |
| `permissions` | lista de regras | Ver abaixo |
| `steps` | inteiro positivo | Máximo de passos do modelo |
| `hidden` | booleano | Some das listas; não é segurança |
| `color` | `#rrggbb` | Cor na interface |
| `disabled` | booleano | Remove o agente naquele ponto da configuração |
| `request` | headers/body | Preservado, mas ainda não enviado na V2 |

## Campos proibidos (legado V1)

`temperature`, `top_p`, `prompt`, `permission` (singular), `tools`,
`disable`, `maxSteps`.

## Permissões

Lista ordenada. **A última regra que casa vence** — regra ampla primeiro,
exceção depois.

```yaml
permissions:
  - action: "*"
    resource: "*"
    effect: deny
  - action: read
    resource: "**"
    effect: allow
```

| `action` | Cobre |
|---|---|
| `shell` | Comandos de shell (o `resource` é o texto do comando) |
| `edit` | Editar, escrever, aplicar patch |
| `subagent` | Agentes filhos |
| `read`, `glob`, `grep` | Descoberta local |
| `webfetch`, `websearch` | Web |
| `skill` | Carregar skill |

`effect` é `allow`, `ask` ou `deny`. Em `read`, `edit` e `external_directory`,
`~` e `$HOME` são expandidos.

## Modos

| Modo | Comportamento |
|---|---|
| `primary` | Agente principal da sessão |
| `subagent` | Só em sessão filha, via tool `subagent` |
| `all` | Serve aos dois |

## Exemplo mínimo de criado

```md
---
description: "Tomas, o Vedor — revê mudanças e aponta faltas por gravidade."
mode: all
color: "#2f4858"
steps: 12
permissions:
  - action: "*"
    resource: "*"
    effect: deny
  - action: read
    resource: "**"
    effect: allow
  - action: glob
    resource: "**"
    effect: allow
  - action: grep
    resource: "**"
    effect: allow
---

Corpo do regimento.
```
