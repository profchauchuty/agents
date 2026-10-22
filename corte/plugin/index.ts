// @ts-nocheck
// Medidor da corte: liquida o custo real das sessões, injeta os atributos no
// system prompt e expõe a tool `corte` ao chanceler.
//
// Regra de ouro: nada aqui pode derrubar uma sessão. Tudo em try/catch, falha
// silenciosa, rastro em erros.log.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Plugin } from "@opencode/plugin"

import {
  carregar,
  gravar,
  nascer,
  pagarCorrida,
  cursarSessao,
  pesoTokens,
  linhaAtributos,
  tabela,
  elogiar,
  censurar,
  ferir,
  descanso,
  soldo,
  multar,
  reviver,
  interditar,
  desfazer,
} from "../corte.mjs"

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const LOG = path.join(AQUI, "..", "erros.log")
const DEPURAR = process.env.CORTE_DEBUG === "1"

function anotar(erro) {
  try {
    const linha = `[${new Date().toISOString()}] ${erro?.stack || erro}\n`
    fs.appendFileSync(LOG, linha, "utf8")
    if (DEPURAR) console.error("[corte]", erro)
  } catch {
    /* o log não pode ser a causa de uma falha */
  }
}

const semAcento = (texto) =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

async function agenteDaSessao(ctx, sessionID) {
  const sessao = await ctx.session.get({ sessionID })
  return { sessao, agente: sessao?.agent }
}

/**
 * Liquida o que a sessão gastou desde a última vez que olhamos.
 * `iniciarSeAntiga` evita cobrar o acervo inteiro de uma sessão retomada.
 */
async function liquidarSessao(ctx, sessionID, { iniciarSeAntiga = false } = {}) {
  const { sessao } = await agenteDaSessao(ctx, sessionID)
  if (!sessao || !sessao.agent) return

  const livro = carregar()
  if (!livro.criados[sessao.agent]) return

  const peso = pesoTokens(sessao.tokens)
  if (peso <= 0) return

  const novo = !livro.sessoes[sessao.id]
  const antiga = Date.now() - (sessao.time?.created ?? Date.now()) > 60_000

  const { tokens, custo } = cursarSessao(
    livro,
    sessao.id,
    peso,
    sessao.cost ?? 0,
    sessao.agent,
    { iniciar: iniciarSeAntiga && novo && antiga },
  )

  if (tokens > 0) {
    pagarCorrida(livro, sessao.agent, {
      tokens,
      custo,
      aceite: 1,
      falhou: sessao.outcome === "failed",
      sessao: sessao.id,
    })
  }

  gravar(livro)
}

/** Filhos terminados e ainda não pagos, em uma varredura só. */
async function varrerFilhos(ctx) {
  let pagina
  try {
    pagina = await ctx.session.list({ directory: ctx.location.directory, limit: 30 })
  } catch (erro) {
    anotar(erro)
    return
  }

  const lista = pagina?.sessions ?? pagina?.items ?? pagina?.data ?? []
  if (!Array.isArray(lista) || !lista.length) return

  const livro = carregar()
  let mexeu = false

  for (const s of lista) {
    try {
      if (!s?.parentID) continue
      if (!s.time?.idle) continue
      if (!livro.criados[s.agent]) continue

      const peso = pesoTokens(s.tokens)
      if (peso <= 0) continue

      const { tokens, custo } = cursarSessao(livro, s.id, peso, s.cost ?? 0, s.agent)
      mexeu = true
      if (tokens <= 0) continue

      pagarCorrida(livro, s.agent, {
        tokens,
        custo,
        aceite: 1,
        falhou: s.outcome === "failed",
        sessao: s.id,
      })
    } catch (erro) {
      anotar(erro)
    }
  }

  if (mexeu) gravar(livro)
}

export default Plugin.define({
  id: "maquiavel.corte",
  async setup(ctx) {
    // 1. Atributos vivos no alto do system prompt, a cada pedido.
    try {
      await ctx.session.hook("context", (event) => {
        try {
          const livro = carregar()
          const criado = livro.criados[event.agent]
          if (!criado) return
          event.system.push({
            type: "text",
            text: `【Corte】${linhaAtributos(criado)}`,
          })
        } catch (erro) {
          anotar(erro)
        }
      })
    } catch (erro) {
      anotar(erro)
    }

    // 2. Ao chegar novo pedido, fecha o turno anterior e varre os filhos.
    try {
      await ctx.session.hook("prompt", async (event) => {
        try {
          await liquidarSessao(ctx, event.sessionID, { iniciarSeAntiga: true })
          await varrerFilhos(ctx)
        } catch (erro) {
          anotar(erro)
        }
      })
    } catch (erro) {
      anotar(erro)
    }

    // 3. Quando um subagente volta, o filho é liquidado sem esperar o turno.
    try {
      await ctx.tool.hook("execute.after", async (event) => {
        try {
          if (DEPURAR)
            anotar(`execute.after: ${JSON.stringify({ ...event, result: undefined })}`)
          const ferramenta = String(event?.tool ?? "")
          if (!ferramenta.includes("subagent")) return
          if (event?.sessionID) await liquidarSessao(ctx, event.sessionID)
          await varrerFilhos(ctx)
        } catch (erro) {
          anotar(erro)
        }
      })
    } catch (erro) {
      anotar(erro)
    }

    // 4. A tool da chancelaria.
    try {
      await ctx.tool.transform((editor) => {
        editor.add({
          name: "corte",
          description:
            "Livro de mercês da corte. Consulta e move vida, honra, experiência e dinheiro dos criados. Só o chanceler Maquiavel concede mercê; os demais apenas consultam.",
          input: {
            type: "object",
            properties: {
              acao: {
                type: "string",
                enum: [
                  "ver",
                  "nascer",
                  "elogiar",
                  "censurar",
                  "ferir",
                  "descanso",
                  "soldo",
                  "multar",
                  "reviver",
                  "interditar",
                  "desfazer",
                ],
              },
              criado: { type: "string", description: "ID do criado, ex.: tomas-vedor" },
              nome: { type: "string" },
              oficio: { type: "string" },
              baseline: { type: "number", description: "Custo esperado em tokens" },
              peso: { type: "number", description: "1 leve, 2 sólido, 3 excepcional" },
              grau: {
                type: "string",
                enum: ["leve", "grave", "mortal", "lei", "mentira"],
              },
              pontos: { type: "number", description: "Pontos de soldo ou multa" },
              motivo: { type: "string" },
            },
            required: ["acao"],
            additionalProperties: false,
          },
          execute: async (input, context) => {
            try {
              const { agente } = await agenteDaSessao(ctx, context.sessionID)

              if (input.acao !== "ver" && agente !== "maquiavel")
                return {
                  content:
                    "Recusado: só o chanceler concede mercê. A ti cabe apenas consultar o livro (acao: ver).",
                }

              const livro = carregar()
              const id = input.criado

              switch (input.acao) {
                case "ver": {
                  if (!id) return { content: tabela(livro) }
                  const c = livro.criados[id]
                  if (!c) return { content: `Não há criado de nome "${id}" no livro.` }
                  return { content: linhaAtributos(c) }
                }

                case "nascer": {
                  const nome = input.nome || id
                  const oficio = input.oficio || "servidor"
                  const idFinal = id || `${semAcento(nome)}-${semAcento(oficio)}`
                  const c = nascer(livro, {
                    id: idFinal,
                    nome,
                    oficio,
                    baseline: input.baseline,
                  })
                  gravar(livro)
                  return { content: `Nasceu ${c.nome}, o ${c.oficio} (${idFinal}).\n${linhaAtributos(c)}` }
                }

                case "elogiar": {
                  const e = elogiar(livro, id, input.peso ?? 1, input.motivo || "", "maquiavel")
                  gravar(livro)
                  return { content: e ? `Honra concedida: ${JSON.stringify(e.delta)}` : "Limite do dia atingido." }
                }

                case "censurar": {
                  const e = censurar(livro, id, input.peso ?? 1, input.motivo || "", "maquiavel")
                  gravar(livro)
                  return { content: e ? `Honra retirada: ${JSON.stringify(e.delta)}` : "Limite do dia atingido." }
                }

                case "ferir": {
                  const e = ferir(livro, id, input.grau || "leve", input.motivo || "", "maquiavel")
                  gravar(livro)
                  return { content: e ? `Ferida aplicada: ${JSON.stringify(e.delta)}` : "Nada se alterou." }
                }

                case "descanso": {
                  const e = descanso(livro, id)
                  gravar(livro)
                  return { content: e ? `Descanso: ${JSON.stringify(e.delta)}` : "Nada se alterou." }
                }

                case "soldo": {
                  const e = soldo(livro, id, input.pontos ?? 0, input.motivo || "", "maquiavel")
                  gravar(livro)
                  return { content: e ? `Soldo: ${JSON.stringify(e.delta)}` : "Nada se alterou." }
                }

                case "multar": {
                  const e = multar(livro, id, input.pontos ?? 0, input.motivo || "", "maquiavel")
                  gravar(livro)
                  return { content: e ? `Multa: ${JSON.stringify(e.delta)}` : "Nada se alterou." }
                }

                case "reviver": {
                  const e = reviver(livro, id)
                  gravar(livro)
                  return { content: e ? `Perdão: ${JSON.stringify(e.delta)}` : "Nada se alterou." }
                }

                case "interditar": {
                  const e = interditar(livro, id, input.motivo || "", "maquiavel")
                  gravar(livro)
                  return { content: e ? `Interdito: ${JSON.stringify(e.delta)}` : "Nada se alterou." }
                }

                case "desfazer": {
                  const e = desfazer(livro, id)
                  gravar(livro)
                  return { content: `Desfeito: ${e.ato} (${e.em})` }
                }

                default:
                  return { content: `Ação desconhecida: ${input.acao}` }
              }
            } catch (erro) {
              anotar(erro)
              return { content: `A corte não pôde lavrar: ${erro.message}` }
            }
          },
        })
      })
    } catch (erro) {
      anotar(erro)
    }
  },
})
