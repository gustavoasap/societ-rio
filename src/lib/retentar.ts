type Resultado = { error: { message: string } | null }

// Logo após o login, o token pode chegar com horário levemente à frente do servidor
// de dados ("JWT issued at future"). Aguarda um pouco e tenta de novo.
export async function comRetentativa<T extends Resultado[]>(buscar: () => Promise<T>): Promise<T> {
  let res = await buscar()
  for (let tentativa = 0; tentativa < 3 && res.some((r) => /issued at future/i.test(r.error?.message ?? '')); tentativa++) {
    await new Promise((r) => setTimeout(r, 1500))
    res = await buscar()
  }
  return res
}
