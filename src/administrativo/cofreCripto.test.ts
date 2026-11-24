import { describe, expect, it } from 'vitest'
import { chaveConfere, cifrar, criarVerificador, decifrar, derivarChave, novoSalt, problemaSenhaMestra } from './cofreCripto'

describe('cofre de senhas', () => {
  it('cifra e decifra com a senha-mestra certa; com a errada não abre', async () => {
    const salt = novoSalt()
    const chave = await derivarChave('MinhaSenha2026', salt, 1000)
    const { iv, cifrado } = await cifrar(chave, 'senha-do-certificado@123')
    expect(cifrado).not.toContain('senha-do-certificado')
    expect(await decifrar(chave, iv, cifrado)).toBe('senha-do-certificado@123')
    const errada = await derivarChave('OutraSenha2026', salt, 1000)
    await expect(decifrar(errada, iv, cifrado)).rejects.toThrow()
    const ver = await criarVerificador(chave)
    expect(await chaveConfere(chave, ver.iv, ver.cifrado)).toBe(true)
    expect(await chaveConfere(errada, ver.iv, ver.cifrado)).toBe(false)
  })
  it('cada senha usa um IV diferente', async () => {
    const chave = await derivarChave('MinhaSenha2026', novoSalt(), 1000)
    const a = await cifrar(chave, 'x')
    const b = await cifrar(chave, 'x')
    expect(a.iv).not.toBe(b.iv)
    expect(a.cifrado).not.toBe(b.cifrado)
  })
  it('regras da senha-mestra', () => {
    expect(problemaSenhaMestra('curta1')).not.toBeNull()
    expect(problemaSenhaMestra('somenteletras')).not.toBeNull()
    expect(problemaSenhaMestra('Asap2026Cofre')).toBeNull()
  })
})
