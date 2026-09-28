import {
  Baby,
  BookOpen,
  Briefcase,
  Car,
  Coffee,
  CreditCard,
  Dumbbell,
  Flag,
  Fuel,
  Gift,
  GraduationCap,
  Heart,
  HeartPulse,
  House,
  Landmark,
  Mountain,
  Music,
  PartyPopper,
  PawPrint,
  PiggyBank,
  Plane,
  Plus,
  Receipt,
  Repeat,
  Shirt,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Sun,
  Tag,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Utensils,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { AreaObjetivo, TipoConta } from '../tipos'

export const ICONES: Record<string, LucideIcon> = {
  tag: Tag,
  house: House,
  utensils: Utensils,
  'shopping-cart': ShoppingCart,
  car: Car,
  fuel: Fuel,
  'heart-pulse': HeartPulse,
  'graduation-cap': GraduationCap,
  'party-popper': PartyPopper,
  star: Star,
  repeat: Repeat,
  receipt: Receipt,
  shirt: Shirt,
  briefcase: Briefcase,
  landmark: Landmark,
  'trending-up': TrendingUp,
  plus: Plus,
  target: Target,
  'piggy-bank': PiggyBank,
  plane: Plane,
  gift: Gift,
  dumbbell: Dumbbell,
  baby: Baby,
  'paw-print': PawPrint,
  smartphone: Smartphone,
  wallet: Wallet,
  'credit-card': CreditCard,
  'book-open': BookOpen,
  zap: Zap,
  coffee: Coffee,
  music: Music,
  wrench: Wrench,
  trophy: Trophy,
  mountain: Mountain,
  heart: Heart,
  sparkles: Sparkles,
  flag: Flag,
}

export const iconeDe = (nome: string | null | undefined): LucideIcon => ICONES[nome ?? ''] ?? Tag

export interface Cor {
  label: string
  fundo: string
  texto: string
  barra: string
}

export const CORES: Record<string, Cor> = {
  azul: { label: 'Azul', fundo: 'bg-azul-100', texto: 'text-azul-700', barra: 'bg-azul-600' },
  celeste: { label: 'Celeste', fundo: 'bg-sky-100', texto: 'text-sky-700', barra: 'bg-sky-500' },
  verde: { label: 'Verde', fundo: 'bg-emerald-100', texto: 'text-emerald-700', barra: 'bg-emerald-500' },
  amarelo: { label: 'Amarelo', fundo: 'bg-amber-100', texto: 'text-amber-700', barra: 'bg-amber-500' },
  laranja: { label: 'Laranja', fundo: 'bg-orange-100', texto: 'text-orange-700', barra: 'bg-orange-500' },
  vermelho: { label: 'Vermelho', fundo: 'bg-rose-100', texto: 'text-rose-700', barra: 'bg-rose-500' },
  rosa: { label: 'Rosa', fundo: 'bg-pink-100', texto: 'text-pink-700', barra: 'bg-pink-500' },
  roxo: { label: 'Roxo', fundo: 'bg-violet-100', texto: 'text-violet-700', barra: 'bg-violet-500' },
  cinza: { label: 'Cinza', fundo: 'bg-slate-100', texto: 'text-slate-600', barra: 'bg-slate-500' },
}

export const corDe = (nome: string | null | undefined): Cor => CORES[nome ?? ''] ?? CORES.azul

export const ICONE_CONTA: Record<TipoConta, LucideIcon> = {
  corrente: Landmark,
  poupanca: PiggyBank,
  investimento: TrendingUp,
  carteira: Wallet,
  cartao: CreditCard,
  outro: Wallet,
}

export const VISUAL_AREA: Record<AreaObjetivo, { icone: LucideIcon; cor: string }> = {
  pessoal: { icone: Sparkles, cor: 'azul' },
  profissional: { icone: Briefcase, cor: 'roxo' },
  financeiro: { icone: PiggyBank, cor: 'verde' },
  saude: { icone: HeartPulse, cor: 'vermelho' },
  familia: { icone: Users, cor: 'rosa' },
  estudos: { icone: GraduationCap, cor: 'celeste' },
  espiritual: { icone: Sun, cor: 'amarelo' },
  lazer: { icone: Plane, cor: 'laranja' },
}
