export type StatusModulo = 'disponivel' | 'em_breve' | 'oculto'

export interface Perfil {
  user_id: string
  email: string
  nome: string | null
  admin: boolean
  ativo: boolean
}

export interface Departamento {
  id: string
  slug: string
  nome: string
  descricao: string | null
  icone: string
  cor: string
  ordem: number
}

export interface Modulo {
  id: string
  departamento_id: string
  nome: string
  descricao: string | null
  icone: string
  link: string | null
  status: StatusModulo
  ordem: number
}

export interface Acesso {
  user_id: string
  departamento_id: string
}

export const STATUS_MODULO: { value: StatusModulo; label: string }[] = [
  { value: 'disponivel', label: 'Disponível' },
  { value: 'em_breve', label: 'Em breve' },
  { value: 'oculto', label: 'Oculto (só administradores veem)' },
]

export const linkExterno = (link: string | null) => !!link && /^https?:\/\//i.test(link)

export function slugify(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
