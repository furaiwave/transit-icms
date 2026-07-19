import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Час доби ГГ:ХХ:СС з Unix-мітки (мс). */
export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString('uk-UA', { hour12: false })
}

/** Прогноз прибуття: <60 с — лише секунди, інакше «Х хв СС с». */
export function fmtEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.round(seconds)
  if (total < 60) return `${total} с`
  return `${Math.floor(total / 60)} хв ${String(total % 60).padStart(2, '0')} с`
}
