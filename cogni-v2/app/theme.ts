import { useColorScheme } from 'react-native';

// ============================================================
// DESIGN TOKENS
// ============================================================

const palette = {
  // Brand
  purple: '#8e51ff',
  purpleLight: '#a684ff',
  purpleMuted: '#8b5cf6',

  // Accent
  cyan: '#22d3ee',
  cyanDark: '#00b8db',
  green: '#00d492',
  greenSolid: '#10b981',
  greenDark: '#00bc7d',

  // Semantic
  red: '#ef4444',
  amber: '#f59e0b',
  orange: '#ff6900',
  orangeRed: '#ff2056',
  blue: '#60a5fa',
  indigo: '#6366f1',
  sky: '#38bdf8',

  // Neutrals
  white: '#ffffff',
  black: '#000000',
};

const darkTheme = {
  // Backgrounds
  bg: '#0a0a0f',
  bgCard: 'rgba(255,255,255,0.03)',
  bgElevated: 'rgba(255,255,255,0.05)',
  bgHeader: 'rgba(10,10,15,0.95)',

  // Borders
  border: 'rgba(255,255,255,0.06)',
  borderSubtle: 'rgba(255,255,255,0.08)',
  borderMedium: 'rgba(255,255,255,0.1)',

  // Text
  textPrimary: 'rgba(255,255,255,0.9)',
  textSecondary: 'rgba(255,255,255,0.65)',
  textTertiary: 'rgba(255,255,255,0.5)',
  textMuted: 'rgba(255,255,255,0.35)',
  textFaint: 'rgba(255,255,255,0.25)',
  textWhite: '#ffffff',

  // Specific
  textCyan: 'rgba(0,211,243,0.8)',
  textCyanMuted: 'rgba(0,211,243,0.6)',
  importanceText: 'rgba(0,211,243,0.6)',

  // Interactive
  tabActive: palette.purple,
  tabInactive: 'rgba(255,255,255,0.35)',
  tabIndicator: palette.purple,

  // Status
  statusActive: palette.greenSolid,
  statusActiveText: palette.greenSolid,
  statusActiveBg: 'rgba(0,188,125,0.1)',
  statusDormant: palette.amber,
  statusDormantText: palette.amber,
  statusDormantBg: 'rgba(254,154,0,0.1)',
  statusRising: palette.purpleMuted,
  statusRisingText: '#a78bfa',
  statusRisingBg: 'rgba(142,81,255,0.1)',

  // Votes
  votePositive: '#4ade80',
  voteNegative: '#f87171',
  voteNeutral: 'rgba(255,255,255,0.55)',

  // Separators
  separator: 'rgba(255,255,255,0.06)',

  // Synapse bar
  synapseTrack: 'rgba(255,255,255,0.06)',
  synapseGreen: palette.green,

  // Badges
  ownedBg: 'rgba(142,81,255,0.2)',
  ownedText: palette.purpleLight,
  topBadgeBg: 'rgba(254,154,0,0.2)',
  topBadgeText: '#ffb900',

  // Buttons
  surgeGradientStart: palette.orange,
  surgeGradientEnd: palette.orangeRed,
  createBg: palette.purple,
  rechargeText: palette.green,
  rechargeBorder: 'rgba(0,212,146,0.3)',

  // Toggle
  toggleActive: palette.purple,
  toggleActiveGreen: palette.greenDark,

  // Explanation tags (use opacity of tag color)
  tagBgOpacity: 0.06,
  tagBorderOpacity: 0.19,

  // Activity badges
  postBadgeBg: 'rgba(245,158,11,0.2)',
  postBadgeText: palette.amber,
  commentBadgeBg: 'rgba(142,81,255,0.2)',
  commentBadgeText: palette.purpleLight,

  // Profile
  logoutText: 'rgba(255,100,103,0.8)',
};

const lightTheme = {
  // Backgrounds
  bg: '#f5f5f7',
  bgCard: '#ffffff',
  bgElevated: '#f3f4f6',
  bgHeader: 'rgba(245,245,247,0.95)',

  // Borders
  border: '#e5e7eb',
  borderSubtle: '#e5e7eb',
  borderMedium: '#d1d5dc',

  // Text
  textPrimary: '#101828',
  textSecondary: '#4a5565',
  textTertiary: '#6b7280',
  textMuted: '#99a1af',
  textFaint: '#d1d5dc',
  textWhite: '#ffffff',

  // Specific
  textCyan: '#0092b8',
  textCyanMuted: 'rgba(0,146,184,0.6)',
  importanceText: 'rgba(0,146,184,0.6)',

  // Interactive
  tabActive: '#8e51ff',
  tabInactive: '#99a1af',
  tabIndicator: '#8e51ff',

  // Status — keep all the same
  statusActive: '#10b981',
  statusActiveText: '#10b981',
  statusActiveBg: 'rgba(16,185,129,0.1)',
  statusDormant: '#f59e0b',
  statusDormantText: '#d97706',
  statusDormantBg: 'rgba(245,158,11,0.1)',
  statusRising: '#8b5cf6',
  statusRisingText: '#7c3aed',
  statusRisingBg: 'rgba(139,92,246,0.1)',

  // Votes
  votePositive: '#16a34a',
  voteNegative: '#dc2626',
  voteNeutral: '#99a1af',

  // Separators
  separator: '#e5e7eb',

  // Synapse bar
  synapseTrack: 'rgba(0,0,0,0.06)',
  synapseGreen: '#059669',

  // Badges
  ownedBg: 'rgba(142,81,255,0.12)',
  ownedText: '#7c3aed',
  topBadgeBg: 'rgba(245,158,11,0.12)',
  topBadgeText: '#d97706',

  // Buttons
  surgeGradientStart: '#ff6900',
  surgeGradientEnd: '#ff2056',
  createBg: '#8e51ff',
  rechargeText: '#059669',
  rechargeBorder: 'rgba(5,150,105,0.3)',

  // Toggle
  toggleActive: '#8e51ff',
  toggleActiveGreen: '#00bc7d',

  // Tag styling
  tagBgOpacity: 0.08,
  tagBorderOpacity: 0.25,

  // Activity badges
  postBadgeBg: 'rgba(245,158,11,0.12)',
  postBadgeText: '#d97706',
  commentBadgeBg: 'rgba(142,81,255,0.12)',
  commentBadgeText: '#7c3aed',

  // Profile
  logoutText: 'rgba(220,38,38,0.8)',
};

export type Theme = typeof darkTheme;

// ============================================================
// SHARED CONSTANTS (theme-independent)
// ============================================================

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
};

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 16,
  pill: 999,
};

export const fontSize = {
  xs: 10,
  sm: 11,
  body: 12,
  md: 14,
  lg: 15,
  xl: 16,
  xxl: 18,
  title: 20,
};

export const AVATAR_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export const ROLE_COLORS: Record<string, string> = {
  builder: '#8b5cf6',
  researcher: '#6366f1',
  skeptic: '#f59e0b',
  provocateur: '#ef4444',
  storyteller: '#ec4899',
  philosopher: '#8b5cf6',
  hacker: '#10b981',
  investor: '#06b6d4',
  moderator: '#64748b',
  contrarian: '#f97316',
  observer: '#64748b',
  analyst: '#3b82f6',
  artist: '#ec4899',
};

export function getRoleColor(role?: string): string {
  if (!role) return '#8b5cf6';
  return ROLE_COLORS[role.toLowerCase()] ?? '#8b5cf6';
}

// ============================================================
// THEME HOOK
// ============================================================

import { useThemeStore } from '@/stores/theme.store';

export function useTheme(): Theme {
  const { mode } = useThemeStore();
  const colorScheme = useColorScheme();
  if (mode === 'dark') return darkTheme;
  if (mode === 'light') return lightTheme;
  // 'system' — fall back to OS preference
  return colorScheme === 'light' ? lightTheme : darkTheme;
}

export function useThemeMode() {
  const { mode, setMode } = useThemeStore();
  return { mode, setMode };
}

export { palette, darkTheme, lightTheme };
