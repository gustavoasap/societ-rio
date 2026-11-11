// Consulta CNPJ no Serpro (API comercial "Consulta CNPJ", dados da Receita Federal atualizados).
// A chave do contrato fica nos segredos do Supabase: SERPRO_CONSUMER_KEY e SERPRO_CONSUMER_SECRET.
// SERPRO_CNPJ_PRODUTO (opcional): basica | qsa | empresa (padrão: qsa).
// Sem a chave cadastrada responde { configurado: false } e o portal usa as fontes gratuitas.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const GATEWAY = 'https://gateway.apiserpro.serpro.gov.br'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

let tokenCache: { valor: string; expira: number } | null = null

async function obterToken(key: string, secret: string, renovar = false) {
  if (!renovar && tokenCache && tokenCache.expira > Date.now() + 60_000) return tokenCache.valor
  const r = await fetch(`${GATEWAY}/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(`${key}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  if (!r.ok) throw new Error(`Serpro recusou a autenticação (${r.status}). Confira a chave do contrato.`)
  const d = await r.json()
  tokenCache = { valor: d.access_token, expira: Date.now() + Number(d.expires_in ?? 3600) * 1000 }
  return tokenCache.valor
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { cnpj } = await req.json().catch(() => ({}))
    const num = String(cnpj ?? '').replace(/\D/g, '')
    if (num.length !== 14) return json({ erro: 'CNPJ precisa ter 14 dígitos.' }, 400)

    const key = Deno.env.get('SERPRO_CONSUMER_KEY')
    const secret = Deno.env.get('SERPRO_CONSUMER_SECRET')
    if (!key || !secret) return json({ configurado: false })

    const produto = ['basica', 'qsa', 'empresa'].includes(Deno.env.get('SERPRO_CNPJ_PRODUTO') ?? '') ? Deno.env.get('SERPRO_CNPJ_PRODUTO')! : 'qsa'

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: u } = await admin.auth.getUser(jwt)
    if (!u?.user) return json({ erro: 'Faça login no portal.' }, 401)

    const consultar = async (renovar: boolean) =>
      fetch(`${GATEWAY}/consulta-cnpj-df/v2/${produto}/${num}`, {
        headers: { Authorization: `Bearer ${await obterToken(key, secret, renovar)}`, Accept: 'application/json' },
      })
    let r = await consultar(false)
    if (r.status === 401) r = await consultar(true)

    await admin.from('cnpj_consultas_serpro').insert({ cnpj: num, produto, status: r.status, usuario_id: u.user.id })

    if (r.status === 404) return json({ configurado: true, erro: 'CNPJ não encontrado na Receita Federal.' }, 404)
    if (!r.ok) return json({ configurado: true, erro: `Serpro respondeu ${r.status}: ${(await r.text()).slice(0, 300)}` }, 502)
    return json({ configurado: true, produto, dados: await r.json() })
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : String(e) }, 500)
  }
})
