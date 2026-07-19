import { z } from 'zod'
import type { UnixMs } from './brand'

/**
 * Звіт із результатами: узагальнена форма таблиці, щоб клієнт лишався
 * «тонким», а весь зміст (і походження чисел) визначався на сервері.
 */

/** Звідки взялися числа — рендериться значком біля заголовка таблиці. */
export const TABLE_SOURCES = ['code', 'experiment', 'manual'] as const
export type TableSource = (typeof TABLE_SOURCES)[number]

export interface ReportTable {
    /** Номер за структурою роботи: '1.1', '3.2' тощо */
    readonly id: string
    readonly title: string
    readonly source: TableSource
    readonly columns: readonly string[]
    readonly rows: readonly (readonly string[])[]
    /** Пояснення методики або застереження щодо інтерпретації */
    readonly note?: string
    /** Скільки кадрів лягло в основу (лише для експериментальних таблиць) */
    readonly samples?: number
}

export interface ReportSection {
    readonly id: string
    readonly title: string
    readonly tables: readonly ReportTable[]
}

export interface ReportDto {
    readonly generatedAt: UnixMs
    /** Скільки часу накопичувалась експериментальна вибірка, с */
    readonly collectingSeconds: number
    readonly sections: readonly ReportSection[]
}

export const ReportCommandSchema = z.discriminatedUnion('type', [
    /** Скинути накопичену вибірку і почати замір заново */
    z.object({ type: z.literal('RESET') }),
])

export type ReportCommand = z.infer<typeof ReportCommandSchema>
