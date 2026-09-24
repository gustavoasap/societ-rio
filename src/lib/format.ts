const digitos = (v: string) => v.replace(/\D/g, '')

export function mascaraCnpj(v: string) {
  return digitos(v)
    .slice(0, 14)
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export function mascaraCpf(v: string) {
  return digitos(v)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function mascaraCep(v: string) {
  return digitos(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2')
}

export function mascaraTelefone(v: string) {
  const d = digitos(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

export function formatarData(iso: string | null | undefined) {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function formatarMoeda(v: number | null | undefined) {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarNumero(v: number | null | undefined, sufixo = '') {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + sufixo
}

/** Consulta o CEP na ViaCEP e devolve o endereço em uma linha (sem número). */
export async function buscarCep(cep: string): Promise<{ endereco: string; municipio: string } | null> {
  const d = digitos(cep)
  if (d.length !== 8) return null
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`)
    const j = await r.json()
    if (j.erro) return null
    const partes = [j.logradouro, j.bairro, `${j.localidade}/${j.uf}`].filter(Boolean)
    return { endereco: partes.join(', '), municipio: `${j.localidade}/${j.uf}` }
  } catch {
    return null
  }
}
