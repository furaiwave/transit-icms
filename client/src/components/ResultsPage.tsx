import { useEffect, useState, type JSX } from 'react';
import type { ReportDto, ReportTable, TableSource } from '@icms/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApiQuery } from '@/hooks/useApiQuery';
import { api } from '@/lib/api';

const SOURCE_LABEL: Readonly<Record<TableSource, string>> = {
  code: 'з коду',
  experiment: 'експеримент',
  manual: 'редагується вручну',
};

const SOURCE_VARIANT: Readonly<Record<TableSource, 'ok' | 'warn' | 'neutral'>> = {
  code: 'ok',
  experiment: 'warn',
  manual: 'neutral',
};

/** Копіювання таблиці як TSV — вставляється у Word/LibreOffice як таблиця. */
const toTsv = (table: ReportTable): string =>
  [table.columns, ...table.rows].map((r) => r.join('\t')).join('\n');

const ReportTableCard = ({ table }: { readonly table: ReportTable }): JSX.Element => {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    void navigator.clipboard.writeText(toTsv(table)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-baseline gap-2">
            <span className="font-mono text-warn">{table.id}</span>
            <span>{table.title}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={SOURCE_VARIANT[table.source]}>{SOURCE_LABEL[table.source]}</Badge>
            {table.samples !== undefined && (
              <span className="font-mono text-[11px] text-dim">n = {table.samples}</span>
            )}
            <Button variant="outline" size="sm" onClick={copy} disabled={table.rows.length === 0}>
              {copied ? 'скопійовано' : 'копіювати'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-1">
        {table.rows.length === 0 ? (
          <p className="py-3 text-xs text-dim">{table.note ?? 'Немає даних.'}</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  {table.columns.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell
                        key={j}
                        className={j === 0 ? 'font-medium text-ink' : 'tabular-nums whitespace-normal'}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {table.note && <p className="mt-2 text-[11px] leading-relaxed text-dim">{table.note}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
};

/**
 * Зведення результатів для пояснювальної записки. Таблиці приходять
 * готовими з сервера — клієнт лише рендерить, тому джерело чисел
 * (код / експеримент / ручний текст) визначається в одному місці.
 */
export const ResultsPage = (): JSX.Element => {
  const { data, error, loading, refetch } = useApiQuery('GET /api/report');
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(refetch, 5000);
    return () => clearInterval(t);
  }, [auto, refetch]);

  const reset = (): void => {
    setBusy(true);
    void api('POST /api/report', { type: 'RESET' })
      .then(() => refetch())
      .finally(() => setBusy(false));
  };

  const report: ReportDto | null = data;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 p-3">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Результати експериментів</CardTitle>
              <p className="mt-1 text-[11px] text-dim">
                {report
                  ? `Вибірка накопичується ${report.collectingSeconds} с. Експериментальні таблиці
                     заповнюються, доки симуляція працює.`
                  : 'Завантаження…'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant={auto ? 'default' : 'outline'} size="sm" onClick={() => setAuto((v) => !v)}>
                {auto ? 'автооновлення: увімк' : 'автооновлення: вимк'}
              </Button>
              <Button variant="outline" size="sm" onClick={refetch} disabled={loading}>
                оновити
              </Button>
              <Button variant="outline" size="sm" onClick={reset} disabled={busy}>
                почати замір заново
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {error && (
        <Card>
          <CardContent className="py-4 text-xs text-danger">Помилка запиту: {error}</CardContent>
        </Card>
      )}

      {report?.sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-3">
          <h2 className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-dim">
            {section.title}
          </h2>
          {section.tables.map((table) => (
            <ReportTableCard key={table.id} table={table} />
          ))}
        </section>
      ))}
    </div>
  );
};
