// Leitura do arquivo do certificado com node-forge (carregada só quando necessária).
import forge from 'node-forge'
import type { InfoCertificado } from './certificado'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function binario(buf: ArrayBuffer) {
  const b = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return s
}

function deCertificado(c: forge.pki.Certificate): InfoCertificado {
  const cn = (c.subject.getField('CN')?.value as string | undefined) ?? null
  // e-CNPJ: o CNPJ vem no nome (RAZAO SOCIAL:12345678000190) ou na extensão ICP-Brasil 2.16.76.1.3.3
  let cnpj = cn?.match(/(\d{14})/)?.[1] ?? null
  if (!cnpj) {
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes()
    const i = der.indexOf(forge.asn1.oidToDer('2.16.76.1.3.3').getBytes())
    if (i >= 0) cnpj = der.slice(i, i + 60).match(/(\d{14})/)?.[1] ?? null
  }
  return {
    validade: iso(c.validity.notAfter),
    inicio: iso(c.validity.notBefore),
    titular: cn ? cn.replace(/:\d{11,14}$/, '').trim() : null,
    cnpj,
    protegido: false,
    invalido: false,
  }
}

/** Escolhe o certificado do titular (o que não é de Autoridade Certificadora). */
function doTitular(certs: forge.pki.Certificate[]) {
  const finais = certs.filter((c) => {
    const bc = c.getExtension('basicConstraints') as { cA?: boolean } | null
    return !bc?.cA
  })
  return (finais.length ? finais : certs).sort((a, b) => b.validity.notAfter.getTime() - a.validity.notAfter.getTime())[0]
}

function certsDoPfx(der: string, senha: string) {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(der), false, senha)
  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  return bags.map((b) => b.cert).filter((c): c is forge.pki.Certificate => !!c)
}

/** Conteúdo de um OCTET STRING (pode vir em pedaços). */
function octetos(n: forge.asn1.Asn1): string {
  return typeof n.value === 'string' ? n.value : (n.value as forge.asn1.Asn1[]).map(octetos).join('')
}

const OID_DATA = '1.2.840.113549.1.7.1'
const OID_CERTBAG = '1.2.840.113549.1.12.10.1.3'

/**
 * Certificados que vêm abertos dentro do .pfx (sem senha): percorre só as partes não criptografadas
 * e nunca toca na chave privada.
 */
function certsAbertos(der: string): forge.pki.Certificate[] {
  const r: forge.pki.Certificate[] = []
  const pfx = forge.asn1.fromDer(der).value as forge.asn1.Asn1[]
  const authSafe = pfx[1].value as forge.asn1.Asn1[]
  if (forge.asn1.derToOid(authSafe[0].value as string) !== OID_DATA) return r
  const conteudos = forge.asn1.fromDer(octetos((authSafe[1].value as forge.asn1.Asn1[])[0])).value as forge.asn1.Asn1[]
  for (const ci of conteudos) {
    const partes = ci.value as forge.asn1.Asn1[]
    if (forge.asn1.derToOid(partes[0].value as string) !== OID_DATA) continue // parte criptografada
    const bags = forge.asn1.fromDer(octetos((partes[1].value as forge.asn1.Asn1[])[0])).value as forge.asn1.Asn1[]
    for (const bag of bags) {
      const b = bag.value as forge.asn1.Asn1[]
      if (forge.asn1.derToOid(b[0].value as string) !== OID_CERTBAG) continue
      const certBag = (b[1].value as forge.asn1.Asn1[])[0].value as forge.asn1.Asn1[]
      const derCert = octetos((certBag[1].value as forge.asn1.Asn1[])[0])
      try {
        r.push(forge.pki.certificateFromAsn1(forge.asn1.fromDer(derCert)))
      } catch {
        // certificado de AC em formato não suportado: ignora
      }
    }
  }
  return r
}

export function lerCertificadoSincrono(buf: ArrayBuffer, nome: string, senha?: string): InfoCertificado {
  const vazio: InfoCertificado = { validade: null, inicio: null, titular: null, cnpj: null, protegido: false, invalido: false }
  const der = binario(buf)
  // .cer/.crt (PEM ou DER)
  if (/\.(cer|crt|pem)$/i.test(nome)) {
    try {
      const txt = new TextDecoder().decode(buf)
      const c = txt.includes('BEGIN CERTIFICATE') ? forge.pki.certificateFromPem(txt) : forge.pki.certificateFromAsn1(forge.asn1.fromDer(der))
      return deCertificado(c)
    } catch {
      return { ...vazio, invalido: true }
    }
  }
  let estrutura = true
  try {
    forge.asn1.fromDer(der)
  } catch {
    estrutura = false
  }
  if (!estrutura) return { ...vazio, invalido: true }
  // 1º sem senha (partes abertas); 2º senha vazia; 3º a senha digitada (só para leitura, não é guardada)
  const formas: (() => forge.pki.Certificate[])[] = [() => certsAbertos(der), () => certsDoPfx(der, '')]
  if (senha) formas.unshift(() => certsDoPfx(der, senha))
  for (const f of formas) {
    try {
      const certs = f()
      if (certs.length) return deCertificado(doTitular(certs))
    } catch {
      // senha errada ou parte protegida: tenta a próxima forma
    }
  }
  return { ...vazio, protegido: true }
}
