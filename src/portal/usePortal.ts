import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { comRetentativa } from '../lib/retentar'
import type { Departamento, Modulo, Perfil } from './tipos'

export interface DadosPortal {
  perfil: Perfil | null
  departamentos: Departamento[]
  modulos: Modulo[]
  carregando: boolean
  erro: string | null
  recarregar: () => Promise<void>
}

// O banco já devolve só o que o usuário pode ver (regras de acesso no Supabase)
export function usePortal(session: Session): DadosPortal {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [departamentos, setDepartamentos] = useState<Departamento[]>([])
  const [modulos, setModulos] = useState<Modulo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const userId = session.user.id

  const recarregar = useCallback(async () => {
    const [p, d, m] = await comRetentativa(() =>
      Promise.all([
        supabase.from('portal_perfis').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('portal_departamentos').select('*').order('ordem').order('nome'),
        supabase.from('portal_modulos').select('*').order('ordem').order('nome'),
      ]),
    )
    const falha = p.error ?? d.error ?? m.error
    setErro(falha ? falha.message : null)
    setPerfil((p.data as Perfil | null) ?? null)
    setDepartamentos((d.data as Departamento[]) ?? [])
    setModulos((m.data as Modulo[]) ?? [])
    setCarregando(false)
  }, [userId])

  useEffect(() => {
    recarregar()
  }, [recarregar])

  return { perfil, departamentos, modulos, carregando, erro, recarregar }
}
