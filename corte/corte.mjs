#!/usr/bin/env node
// Livro de mercês da corte.
// Único escritor de corte.json. As fórmulas vivem aqui, não na prosa dos agentes.
//
// Uso: node corte.mjs <ação> [id] [--opções]
// Ajuda: node corte.mjs ajuda

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const AQUI = path.dirname(fileURLToPath(import.meta.url))

export const CAMINHO_LIVRO = process.env.CORTE_LIVRO || path.join(AQUI, "corte.json")

export const NASCIMENTO = Object.freeze({
  vida: 100,
  honra: 0,
  experiencia: 0,
  dinheiro: 50,
})

export const LIMITES = Object.freeze({
  honra: { evento: 25, ganhoDia: 30, perdaDia: 30 },
  experiencia: { evento: 25, ganhoDia: 25, perdaDia: 25 },
  vida: { evento: 30, ganhoDia: 30, perdaDia: 30 },
  dinheiro: { evento: 100, ganhoDia: 30, perdaDia: Infinity },
})

const GRAUS_DE_FERIDA = Object.freeze({
  leve: 3,
  grave: 10,
  mortal: 30,
  lei: 5,
  mentira: 15,
})

// ---------------------------------------------------------------- utilidades

const agora = () => new Date().toISOString()
const hoje = () => {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mes}-${dia}`
}

const limitar = (n, min, max) => Math.max(min, Math.min(max, n))
const inteiro = (v, padrao = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.trunc(n) : padrao
}
const numero = (v, padrao = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : padrao
}

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b)
  if (!v.length) return 0
  const meio = Math.floor(v.length / 2)
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2)
}

const retrato = (c) => ({
  vida: c.vida,
  honra: c.honra,
  experiencia: c.experiencia,
  dinheiro: c.dinheiro,
})

// ------------------------------------------------------------------- o livro

export function carregar() {
  try {
    const livro = JSON.parse(fs.readFileSync(CAMINHO_LIVRO, "utf8"))
    livro.version ??= 1
    livro.criados ??= {}
    livro.sessoes ??= {}
    return livro
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro
    return { version: 1, atualizado: null, criados: {}, sessoes: {} }
  }
}

export function gravar(livro) {
  livro.version = 1
  livro.atualizado = agora()
  podarSessoes(livro)
  fs.mkdirSync(path.dirname(CAMINHO_LIVRO), { recursive: true })
  const temporario = `${CAMINHO_LIVRO}.${process.pid}.tmp`
  fs.writeFileSync(temporario, JSON.stringify(livro, null, 2) + "\n", "utf8")
  fs.renameSync(temporario, CAMINHO_LIVRO)
}

function podarSessoes(livro) {
  const corte = Date.now() - 7 * 24 * 60 * 60 * 1000
  for (const [id, s] of Object.entries(livro.sessoes)) {
    const em = Date.parse(s?.em || "")
    if (!Number.isFinite(em) || em < corte) delete livro.sessoes[id]
  }
}

export function criado(livro, id) {
  const c = livro.criados[id]
  if (!c) throw new Error(`Não há criado de nome "${id}" no livro.`)
  return c
}

// ------------------------------------------------------------- dia e mercês

function zerarDia(c) {
  if (!c.dia || c.dia.data !== hoje()) {
    c.dia = {
      data: hoje(),
      honra_mais: 0,
      honra_menos: 0,
      experiencia_mais: 0,
      experiencia_menos: 0,
      vida_mais: 0,
      vida_menos: 0,
      dinheiro_mais: 0,
      dinheiro_menos: 0,
    }
  }
}

const tetoDoDia = (campo, sinal) =>
  sinal > 0 ? LIMITES[campo].ganhoDia : LIMITES[campo].perdaDia

/**
 * Aplica mudanças com teto por evento, teto diário e limite 0–100.
 * Registra uma linha no histórico com antes → depois.
 */
export function registrar(c, mudancas, ato, autor = "maquiavel", motivo = "") {
  zerarDia(c)
  const antes = retrato(c)
  const real = {}

  for (const campo of Object.keys(LIMITES)) {
    let v = inteiro(mudancas[campo])
    if (!v) continue

    v = limitar(v, -LIMITES[campo].evento, LIMITES[campo].evento)
    const chave = `${campo}_${v > 0 ? "mais" : "menos"}`
    const restante = tetoDoDia(campo, v) - (c.dia[chave] || 0)
    if (v > 0) v = Math.min(v, restante)
    else v = Math.max(v, -restante)
    if (!v) continue

    const valorAntes = c[campo]
    c[campo] = limitar(valorAntes + v, 0, 100)
    const efeito = c[campo] - valorAntes
    if (!efeito) continue

    c.dia[chave] = (c.dia[chave] || 0) + Math.abs(efeito)
    real[campo] = efeito
  }

  if (c.vida <= 0 && c.estado !== "interdito") c.estado = "interdito"

  if (!Object.keys(real).length) return null

  const entrada = {
    em: agora(),
    ato,
    autor,
    motivo,
    antes,
    depois: retrato(c),
    delta: real,
  }
  c.historico = [...(c.historico || []), entrada].slice(-50)
  return entrada
}

// ------------------------------------------------------------- nascimento

export function nascer(livro, { id, nome, oficio, baseline, dinheiro }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id || ""))
    throw new Error(`ID inválido: "${id}". Use minúsculas, números e hífen.`)
  if (livro.criados[id])
    throw new Error(`Já existe criado com o ID "${id}". Escolhei outro nome.`)

  const c = {
    nome: nome || id,
    oficio: oficio || "servidor",
    nascimento: hoje(),
    vida: NASCIMENTO.vida,
    honra: NASCIMENTO.honra,
    experiencia: NASCIMENTO.experiencia,
    dinheiro: Number.isFinite(Number(dinheiro)) ? inteiro(dinheiro) : NASCIMENTO.dinheiro,
    estado: "vivo",
    baseline_padrao: inteiro(baseline, 8000) || 8000,
    troco: 0,
    gasto_total_usd: 0,
    tenca_ultima: null,
    corridas: [],
    historico: [],
    dia: null,
  }
  zerarDia(c)
  c.historico.push({
    em: agora(),
    ato: "nascimento",
    autor: "coroa",
    motivo: "forja",
    antes: { vida: 0, honra: 0, experiencia: 0, dinheiro: 0 },
    depois: retrato(c),
    delta: retrato(c),
  })
  livro.criados[id] = c
  return c
}

// ------------------------------------------------------------------ tença

export function valorDaTenca(honra) {
  if (honra < 20) return 3
  if (honra < 60) return 6
  if (honra < 90) return 9
  return 12
}

/** Paga a tença do dia, uma única vez por criado. */
export function aplicarTenca(c) {
  zerarDia(c)
  if (c.estado !== "vivo") return null
  if (c.tenca_ultima === hoje()) return null
  c.tenca_ultima = hoje()
  return registrar(c, { dinheiro: valorDaTenca(c.honra) }, "tenca", "coroa", "tença do dia")
}

export function pagarTencaATodos(livro) {
  const pagos = []
  for (const [id, c] of Object.entries(livro.criados)) {
    if (aplicarTenca(c)) pagos.push(id)
  }
  return pagos
}

// ------------------------------------------------------------ mercês e penas

export function elogiar(livro, id, peso = 1, motivo = "", autor = "maquiavel") {
  const c = criado(livro, id)
  aplicarTenca(c)
  const p = limitar(inteiro(peso, 1), 1, 3)
  const ganho = Math.max(1, Math.ceil(p * 5 * (1 - c.honra / 100)))
  return registrar(c, { honra: ganho }, "elogio", autor, motivo)
}

export function censurar(livro, id, peso = 1, motivo = "", autor = "maquiavel") {
  const c = criado(livro, id)
  aplicarTenca(c)
  const p = limitar(inteiro(peso, 1), 1, 3)
  const perda = Math.max(1, Math.ceil(p * 4 * (0.5 + c.honra / 100)))
  return registrar(c, { honra: -perda }, "censura", autor, motivo)
}

export function ferir(livro, id, grau = "leve", motivo = "", autor = "maquiavel") {
  const c = criado(livro, id)
  const perda = GRAUS_DE_FERIDA[grau]
  if (!perda) throw new Error(`Grau de ferida desconhecido: "${grau}".`)
  const mudancas = { vida: -perda }
  if (grau === "mentira") mudancas.honra = -10
  return registrar(c, mudancas, `ferida:${grau}`, autor, motivo)
}

export function descanso(livro, id, autor = "maquiavel") {
  const c = criado(livro, id)
  return registrar(c, { vida: 15 }, "descanso", autor, "descanso concedido")
}

export function soldo(livro, id, pontos, motivo = "", autor = "maquiavel") {
  const c = criado(livro, id)
  aplicarTenca(c)
  const v = Math.max(0, inteiro(pontos))
  return registrar(c, { dinheiro: v }, "soldo", autor, motivo)
}

export function multar(livro, id, pontos, motivo = "", autor = "maquiavel") {
  const c = criado(livro, id)
  const v = Math.max(0, inteiro(pontos))
  return registrar(c, { dinheiro: -v }, "multa", autor, motivo)
}

/**
 * Juízo do soberano: fixa valores absolutos, sem teto de evento nem de dia.
 * Só a interdição e o perdão usam este caminho.
 */
function forcar(c, valores, ato, autor, motivo) {
  zerarDia(c)
  const antes = retrato(c)
  for (const [campo, valor] of Object.entries(valores)) {
    c[campo] = limitar(inteiro(valor), 0, 100)
  }
  if (c.vida <= 0) c.estado = "interdito"
  const depois = retrato(c)
  const delta = {}
  for (const campo of Object.keys(LIMITES)) {
    if (depois[campo] !== antes[campo]) delta[campo] = depois[campo] - antes[campo]
  }
  const entrada = { em: agora(), ato, autor, motivo, antes, depois, delta }
  c.historico = [...(c.historico || []), entrada].slice(-50)
  return entrada
}

export function reviver(livro, id, autor = "maquiavel") {
  const c = criado(livro, id)
  c.estado = "vivo"
  return forcar(c, { vida: 50 }, "reviver", autor, "perdão do soberano")
}

export function interditar(livro, id, motivo = "", autor = "maquiavel") {
  const c = criado(livro, id)
  c.estado = "interdito"
  return forcar(c, { vida: 0 }, "interdicao", autor, motivo)
}

export function desfazer(livro, id) {
  const c = criado(livro, id)
  const historico = c.historico || []
  if (!historico.length) throw new Error("Nada a desfazer: o histórico está vazio.")
  const ultima = historico.pop()
  Object.assign(c, ultima.antes)
  c.estado = c.vida <= 0 ? "interdito" : "vivo"
  return ultima
}

// ---------------------------------------------------------------- corridas

/** Custo ponderado em tokens: cache lido vale um quarto. */
export function pesoTokens(tokens = {}) {
  const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0)
  return (
    n(tokens.input) +
    n(tokens.output) +
    n(tokens.reasoning) +
    n(tokens.cache?.write) +
    0.25 * n(tokens.cache?.read)
  )
}

/**
 * Cobra o trabalho: experiência pela eficiência, dinheiro pelo custo real,
 * vida por falha. Devolve o que foi aplicado.
 */
export function pagarCorrida(livro, id, { tokens, custo = 0, aceite = 1, falhou = false, sessao }) {
  const c = criado(livro, id)
  aplicarTenca(c)

  const T = Math.max(1, Math.round(numero(tokens, 1)))
  const custoUsd = Math.max(0, numero(custo, 0))

  const aceitas = (c.corridas || []).filter((r) => r.aceite > 0).slice(-5)
  const medianaAceita = aceitas.length >= 3 ? mediana(aceitas.map((r) => r.tokens)) : 0
  const bruto = medianaAceita || c.baseline_padrao
  const B = limitar(bruto, c.baseline_padrao * 0.75, c.baseline_padrao * 1.5)
  const E = limitar(B / T, 0.4, 2.0)

  const q = [1, 0.6, 0].includes(Number(aceite)) ? Number(aceite) : 1
  let xp = q > 0 ? Math.max(1, Math.round(8 * E * q * (1 - c.experiencia / 100))) : 0
  let pena = 0
  if (q === 0) pena = 6
  else if (E < 0.6) pena = Math.round(20 * (0.6 - E))
  const ganhoXp = xp - pena

  const acumulado = (c.troco || 0) + custoUsd * 100
  const debito = Math.floor(acumulado + 1e-9)
  c.troco = Number((acumulado - debito).toFixed(6))
  c.gasto_total_usd = Number(((c.gasto_total_usd || 0) + custoUsd).toFixed(6))

  const mudancas = { experiencia: ganhoXp, dinheiro: -debito }
  if (falhou) mudancas.vida = -3

  const entrada = registrar(
    c,
    mudancas,
    "corrida",
    "plugin",
    `tokens ${T} · base ${Math.round(B)} · E ${E.toFixed(2)} · q ${q} · US$ ${custoUsd.toFixed(3)}`,
  )

  c.corridas = [
    ...(c.corridas || []),
    {
      em: agora(),
      tokens: T,
      baseline: Math.round(B),
      custo_usd: Number(custoUsd.toFixed(6)),
      debito,
      aceite: q,
      sessao: sessao || null,
    },
  ].slice(-5)

  return { xp: ganhoXp, debito, E, B: Math.round(B), aceite: q, falhou, entrada }
}

/**
 * Cursores por sessão: devolve só o que ainda não foi cobrado,
 * de forma monotônica (nunca negativo) e sobrevivente a reinícios.
 */
export function cursarSessao(livro, sessao, pesos, custo, agent, { iniciar = false } = {}) {
  const p = Math.max(0, numero(pesos, 0))
  const c = Math.max(0, numero(custo, 0))
  const s = livro.sessoes[sessao]

  if (!s) {
    livro.sessoes[sessao] = { agent, pesos: p, custo: c, em: agora() }
    return iniciar ? { tokens: 0, custo: 0 } : { tokens: p, custo: c }
  }

  const dP = p - (s.pesos || 0)
  const dC = c - (s.custo || 0)
  s.pesos = Math.max(s.pesos || 0, p)
  s.custo = Math.max(s.custo || 0, c)
  s.agent = agent || s.agent
  s.em = agora()
  return { tokens: Math.max(0, dP), custo: Math.max(0, dC) }
}

// ------------------------------------------------------------------ leitura

export const faixaHonra = (h) =>
  h < 20 ? "noviço" : h < 60 ? "servidor" : h < 90 ? "de confiança" : "da câmara"

export const faixaExperiencia = (x) =>
  x < 30 ? "aprendiz" : x < 70 ? "prático" : "mestre"

export const faixaDinheiro = (d) => (d <= 0 ? "falido" : d < 10 ? "falido" : d < 40 ? "apertado" : "folgado")

export const faixaVida = (v) => (v <= 0 ? "interdito" : v < 30 ? "ferido" : "inteiro")

export function linhaAtributos(c) {
  return (
    `${c.nome}, o ${c.oficio} — ` +
    `vida ${c.vida}${c.estado === "interdito" ? " (interdito)" : ""} · ` +
    `honra ${c.honra} (${faixaHonra(c.honra)}) · ` +
    `experiência ${c.experiencia} (${faixaExperiencia(c.experiencia)}) · ` +
    `bolsa ${c.dinheiro} (${faixaDinheiro(c.dinheiro)})`
  )
}

const pad = (texto, largura) => String(texto).padEnd(largura)

export function tabela(livro) {
  const linhas = Object.entries(livro.criados)
  if (!linhas.length) return "A corte está vazia."
  const cabecalho =
    pad("CRIADO", 20) + pad("OFÍCIO", 16) + pad("VIDA", 6) + pad("HONRA", 7) +
    pad("EXP", 6) + pad("BOLSA", 7) + "ESTADO"
  const corpo = linhas.map(([id, c]) =>
    pad(id, 20) + pad(c.oficio, 16) + pad(c.vida, 6) + pad(c.honra, 7) +
    pad(c.experiencia, 6) + pad(c.dinheiro, 7) + c.estado,
  )
  return [cabecalho, "-".repeat(cabecalho.length), ...corpo].join("\n")
}

// ---------------------------------------------------------------------- CLI

function opcoes(args) {
  const o = { _: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a.startsWith("--")) {
      const chave = a.slice(2)
      const proximo = args[i + 1]
      if (proximo === undefined || proximo.startsWith("--")) o[chave] = true
      else {
        o[chave] = proximo
        i++
      }
    } else o._.push(a)
  }
  return o
}

const AJUDA = `Livro de mercês da corte

  node corte.mjs ver [id] [--json]
  node corte.mjs nascer <id> --nome N --oficio O [--baseline 8000] [--dinheiro 50]
  node corte.mjs elogiar <id> [--peso 1..3] [--motivo "..."]
  node corte.mjs censurar <id> [--peso 1..3] [--motivo "..."]
  node corte.mjs ferir <id> [--grau leve|grave|mortal|lei|mentira] [--motivo "..."]
  node corte.mjs descanso <id>
  node corte.mjs soldo <id> --pontos N [--motivo "..."]
  node corte.mjs multar <id> --pontos N [--motivo "..."]
  node corte.mjs reviver <id>
  node corte.mjs interditar <id> [--motivo "..."]
  node corte.mjs desfazer <id>
  node corte.mjs tenca
  node corte.mjs ajuda

Variáveis: CORTE_LIVRO (caminho do livro)`

function imprimir(entrada) {
  if (!entrada) {
    console.log("Nada se alterou: os limites do dia ou da faixa impediram a mercê.")
    return
  }
  const partes = Object.entries(entrada.delta)
    .map(([campo, v]) => `${campo} ${v > 0 ? "+" : ""}${v}`)
    .join(" · ")
  console.log(`${entrada.ato}: ${partes}`)
  console.log(`  antes: ${JSON.stringify(entrada.antes)}`)
  console.log(`  agora: ${JSON.stringify(entrada.depois)}`)
}

function main() {
  const [acao, id, ...resto] = process.argv.slice(2)
  const o = opcoes(resto)
  const livro = carregar()

  switch (acao) {
    case undefined:
    case "ajuda":
    case "--help":
      console.log(AJUDA)
      return

    case "ver": {
      if (!id) {
        pagarTencaATodos(livro)
        gravar(livro)
        console.log(o.json ? JSON.stringify(livro, null, 2) : tabela(livro))
        return
      }
      const c = criado(livro, id)
      aplicarTenca(c)
      gravar(livro)
      console.log(o.json ? JSON.stringify(c, null, 2) : linhaAtributos(c))
      return
    }

    case "nascer": {
      const c = nascer(livro, {
        id,
        nome: o.nome,
        oficio: o.oficio,
        baseline: o.baseline,
        dinheiro: o.dinheiro,
      })
      gravar(livro)
      console.log(`Nasceu ${c.nome}, o ${c.oficio} (${id}).`)
      console.log(linhaAtributos(c))
      return
    }

    case "elogiar":
      imprimir(elogiar(livro, id, o.peso, o.motivo))
      break
    case "censurar":
      imprimir(censurar(livro, id, o.peso, o.motivo))
      break
    case "ferir":
      imprimir(ferir(livro, id, o.grau, o.motivo))
      break
    case "descanso":
      imprimir(descanso(livro, id))
      break
    case "soldo":
      imprimir(soldo(livro, id, o.pontos, o.motivo))
      break
    case "multar":
      imprimir(multar(livro, id, o.pontos, o.motivo))
      break
    case "reviver":
      imprimir(reviver(livro, id))
      break
    case "interditar":
      imprimir(interditar(livro, id, o.motivo))
      break
    case "desfazer": {
      const desfeita = desfazer(livro, id)
      gravar(livro)
      console.log(`Desfeito: ${desfeita.ato} (${desfeita.em})`)
      return
    }

    case "pagar": {
      const r = pagarCorrida(livro, id, {
        tokens: o.tokens,
        custo: o.custo,
        aceite: o.aceite,
        falhou: Boolean(o.falhou),
        sessao: o.sessao,
      })
      gravar(livro)
      console.log(
        `Corrida paga: xp ${r.xp > 0 ? "+" : ""}${r.xp} · débito ${r.debito} · ` +
          `E ${r.E.toFixed(2)} · base ${r.B}`,
      )
      return
    }

    case "tenca": {
      const pagos = pagarTencaATodos(livro)
      gravar(livro)
      console.log(pagos.length ? `Tença paga a: ${pagos.join(", ")}` : "Ninguém a receber hoje.")
      return
    }

    default:
      console.error(`Ação desconhecida: "${acao}".\n`)
      console.log(AJUDA)
      process.exitCode = 1
      return
  }

  gravar(livro)
}

const ehPrincipal =
  import.meta.main ??
  (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))

if (ehPrincipal) {
  try {
    main()
  } catch (erro) {
    console.error(`Erro: ${erro.message}`)
    process.exitCode = 1
  }
}
