import {
  Rocket,
  Receipt,
  Boxes,
  ChefHat,
  ShoppingCart,
  Wallet,
  Users,
  BarChart3,
  Settings,
  ShieldCheck,
  BookOpen,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';

// Maps the `categoryIcon` frontmatter string (docs-site/content/**/*.md) to an actual icon
// component. Deliberately a fixed, explicit map rather than a dynamic lucide-react lookup by
// name — keeps every valid icon name visible in one place, and an unknown/misspelled one falls
// back to BookOpen instead of silently rendering nothing.
const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket,
  receipt: Receipt,
  boxes: Boxes,
  'chef-hat': ChefHat,
  'shopping-cart': ShoppingCart,
  wallet: Wallet,
  users: Users,
  'bar-chart': BarChart3,
  settings: Settings,
  'shield-check': ShieldCheck,
  'help-circle': HelpCircle,
  'book-open': BookOpen,
};

export const resolveIcon = (name: string | null | undefined): LucideIcon => (name && ICONS[name]) || BookOpen;
