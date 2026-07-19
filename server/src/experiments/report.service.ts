import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ReportDto,
  ReportSection,
  ReportTable,
  TelemetryFrameSchema,
  now,
} from '../../shared/src';
import { GtfsService } from '../gtfs/gtfs.service';
import { GPS_SIGMA_DEG, MODEL_PARAMS, R_MEASURE } from '../processing/params';
import { PipelineService } from '../processing/pipeline.service';
import { ExperimentService } from './experiment.service';

/** Призначення полів кадру — єдина авторська частина таблиці 1.1. */
const FIELD_PURPOSE: Readonly<Record<string, string>> = {
  vehicleId: 'Ідентифікатор борту, ключ стану у трекері',
  routeId: 'Прив’язка до геометрії маршруту з GTFS',
  lat: 'Широта, WGS-84',
  lon: 'Довгота, WGS-84',
  speedKmh: 'Миттєва швидкість за показами приймача',
  heading: 'Курс руху, градуси від півночі за годинниковою стрілкою',
  ts: 'Мітка часу пристрою; монотонність перевіряється детектором STALE_FRAME',
};

const GTFS_ROLE: Readonly<Record<string, string>> = {
  'routes.txt': 'Перелік маршрутів: ідентифікатор, короткий і повний номер',
  'trips.txt': 'Рейси маршруту; зв’язує маршрут із послідовністю зупинок',
  'stops.txt': 'Зупинки з координатами WGS-84',
  'stop_times.txt': 'Порядок зупинок у рейсі — з нього будується вісь маршруту',
};

/** Опис параметрів моделей: символ, одиниця, роль. Значення — з MODEL_PARAMS. */
const PARAM_META: readonly {
  readonly symbol: string;
  readonly label: string;
  readonly unit: string;
  readonly value: number;
  readonly role: string;
}[] = [
  { symbol: 'σ', label: 'СКВ похибки GPS', unit: 'м', value: MODEL_PARAMS.gpsSigmaMeters, role: 'Задає R фільтра Калмана' },
  { symbol: 'R', label: 'Дисперсія вимірювання', unit: 'град²', value: R_MEASURE, role: 'Довіра до виміру; R = (σ/111320)²' },
  { symbol: 'Q', label: 'Шум процесу', unit: 'град²/с', value: MODEL_PARAMS.qProcess, role: 'Допущена «свобода» моделі руху' },
  { symbol: 'σ°', label: 'σ у градусах', unit: 'град', value: GPS_SIGMA_DEG, role: 'Проміжна величина для R' },
  { symbol: 'α', label: 'Коефіцієнт EMA швидкості', unit: '—', value: MODEL_PARAMS.emaAlpha, role: 'Згладжування швидкості' },
  { symbol: 'W', label: 'Вікно ковзної статистики', unit: 'кадрів', value: MODEL_PARAMS.rollingWindow, role: 'База для z-оцінки' },
  { symbol: 'n₀', label: 'Мінімум кадрів для z-детектора', unit: 'кадрів', value: MODEL_PARAMS.minSamplesForZ, role: 'Захист від хибних спрацювань на старті' },
  { symbol: 'z*', label: 'Поріг z-оцінки', unit: '—', value: MODEL_PARAMS.zThreshold, role: 'Межа викиду швидкості' },
  { symbol: 'Δt*', label: 'Максимальний вік кадру', unit: 'мс', value: MODEL_PARAMS.staleMs, role: 'Відсів застарілих кадрів' },
  { symbol: 'v*', label: 'Неявна швидкість стрибка', unit: 'км/год', value: MODEL_PARAMS.jumpImpliedKmh, role: 'Фізична межа правдоподібності' },
  { symbol: 'd*', label: 'Мінімальна інновація стрибка', unit: 'м', value: MODEL_PARAMS.jumpMinMeters, role: 'Нечутливість до шуму приймача' },
  { symbol: 'e*', label: 'Допуск відхилення від осі', unit: 'м', value: MODEL_PARAMS.offRouteMeters, role: 'Поріг OFF_ROUTE' },
  { symbol: 'L', label: 'Випередження пошуку зупинки', unit: 'м', value: MODEL_PARAMS.etaLookaheadMeters, role: 'Щоб не «залипати» на щойно пройденій' },
  { symbol: 'v₀', label: 'Нижня межа швидкості в ETA', unit: 'м/с', value: MODEL_PARAMS.etaMinSpeedMs, role: 'Захист від ділення на ~0' },
];

const num = (x: number, digits = 2): string =>
  Number.isFinite(x) ? x.toFixed(digits) : '—';

/** Компактний запис для дуже малих/великих величин (Q, R). */
const sci = (x: number): string =>
  x !== 0 && (Math.abs(x) < 1e-3 || Math.abs(x) >= 1e6) ? x.toExponential(2) : String(x);

const pct = (x: number | null): string => (x === null ? '—' : `${(x * 100).toFixed(1)} %`);

@Injectable()
export class ReportService {
  constructor(
    private readonly gtfs: GtfsService,
    private readonly pipeline: PipelineService,
    private readonly experiments: ExperimentService,
  ) {}

  reset(): ReportDto {
    this.experiments.reset();
    return this.build();
  }

  build(): ReportDto {
    const snap = this.experiments.snapshot();
    const sections: ReportSection[] = [
      {
        id: '1',
        title: 'Розділ 1. Аналіз предметної області',
        tables: [this.frameStructure(), this.gtfsFiles(), this.approachComparison()],
      },
      {
        id: '2',
        title: 'Розділ 2. Математичні моделі',
        tables: [this.modelParams(), this.kalmanExample()],
      },
      {
        id: '3',
        title: 'Розділ 3. Реалізація та результати',
        tables: [
          this.stackComparison(),
          this.filteringErrors(snap),
          this.detectionQuality(snap),
          this.etaErrors(snap),
          this.performance(snap),
        ],
      },
    ];
    return {
      generatedAt: now(),
      collectingSeconds: snap.collectingSeconds,
      sections,
    };
  }

  /** 1.1 — інтроспекція реальної zod-схеми, а не переписаний від руки список. */
  private frameStructure(): ReportTable {
    const schema = z.toJSONSchema(TelemetryFrameSchema, {
      io: 'input',
      unrepresentable: 'any',
    }) as {
      properties?: Record<string, Record<string, unknown>>;
      required?: readonly string[];
    };
    const props = schema.properties ?? {};
    const required = new Set(schema.required ?? []);

    const rows = Object.entries(props).map(([field, def]) => {
      const type = String(def['type'] ?? '—');
      const parts: string[] = [];
      if (def['minLength'] !== undefined) parts.push(`довжина ≥ ${String(def['minLength'])}`);
      if (def['minimum'] !== undefined) parts.push(`≥ ${String(def['minimum'])}`);
      if (def['exclusiveMinimum'] !== undefined) parts.push(`> ${String(def['exclusiveMinimum'])}`);
      if (def['maximum'] !== undefined && field !== 'ts') parts.push(`≤ ${String(def['maximum'])}`);
      if (def['exclusiveMaximum'] !== undefined) parts.push(`< ${String(def['exclusiveMaximum'])}`);
      return [
        field,
        type === 'integer' ? 'ціле' : type === 'number' ? 'число' : 'рядок',
        parts.length ? parts.join(', ') : '—',
        required.has(field) ? 'так' : 'ні',
        FIELD_PURPOSE[field] ?? '—',
      ];
    });

    return {
      id: '1.1',
      title: 'Структура кадру телеметрії',
      source: 'code',
      columns: ['Поле', 'Тип', 'Діапазон / обмеження', "Обов'язкове", 'Призначення'],
      rows,
      note: 'Побудовано інтроспекцією TelemetryFrameSchema (zod → JSON Schema). Зміна схеми одразу змінює таблицю.',
    };
  }

  /** 1.2 — ролі авторські, кількості записів із фактичного розбору файлів. */
  private gtfsFiles(): ReportTable {
    const rows = this.gtfs.files.map((f) => [
      f.file,
      GTFS_ROLE[f.file] ?? '—',
      String(f.rows),
      `${(f.bytes / 1024).toFixed(1)} КБ`,
    ]);
    return {
      id: '1.2',
      title: 'Файли GTFS та їх роль',
      source: 'code',
      columns: ['Файл', 'Роль у системі', 'Записів', 'Розмір'],
      rows,
      note: `Кількості — з фактичного завантаження ${this.gtfs.all.length} маршрутів.`,
    };
  }

  /** 1.3 — авторський текст; лишається на редагування. */
  private approachComparison(): ReportTable {
    return {
      id: '1.3',
      title: 'Порівняння підходів до моніторингу транспорту',
      source: 'manual',
      columns: ['Підхід', 'Обробка координат', 'Виявлення аномалій', 'Вимоги до даних', 'Обмеження'],
      rows: [
        ['Промислові CAD/AVL', 'Власні фільтри, закритий алгоритм', 'Порогові правила диспетчера', 'Власний протокол бортового обладнання', 'Висока вартість, закритість, прив’язка до вендора'],
        ['Публічні сервіси (GTFS-RT)', 'Зазвичай відсутня, транслюється «як є»', 'Немає', 'GTFS + GTFS-Realtime', 'Немає доступу до сирих вимірів, затримка оновлення'],
        ['ML-підходи', 'Навчені моделі згладжування', 'Класифікатор/автоенкодер', 'Розмічені історичні набори', 'Потрібне навчання й розмітка; погана інтерпретованість'],
        ['Запропонований (Калман + z-оцінка)', 'Фільтр Калмана з моделлю сталої швидкості', 'Фізичні межі + статистичний викид', 'Лише потік кадрів і GTFS', 'Параметри потребують калібрування під клас приймача'],
      ],
      note: 'Чернетка за матеріалами розділу 1 — призначена для ручного редагування.',
    };
  }

  /** 2.1 — значення беруться з MODEL_PARAMS, розсинхрон із кодом неможливий. */
  private modelParams(): ReportTable {
    return {
      id: '2.1',
      title: 'Параметри моделей обробки',
      source: 'code',
      columns: ['Позначення', 'Параметр', 'Значення', 'Одиниця', 'Роль'],
      rows: PARAM_META.map((p) => [p.symbol, p.label, sci(p.value), p.unit, p.role]),
      note: 'Значення імпортуються з MODEL_PARAMS — того самого об’єкта, який використовує конвеєр.',
    };
  }

  /** 2.2 — знімок реального такту фільтра з живого прогону. */
  private kalmanExample(): ReportTable {
    const columns = ['Величина', 'Широта', 'Довгота', 'Позначення'];
    const vehicleId = this.pipeline.tracked.find((id) => this.pipeline.kalmanTrace(id) !== null);
    const trace = vehicleId ? this.pipeline.kalmanTrace(vehicleId) : null;

    if (!trace) {
      return {
        id: '2.2',
        title: 'Числовий приклад одного кроку фільтра Калмана',
        source: 'experiment',
        columns,
        rows: [],
        note: 'Немає даних: запустіть симуляцію, щоб фільтр виконав хоча б один такт.',
      };
    }

    const { lat, lon } = trace;
    const rows = [
      ['Крок за часом Δt, с', num(lat.dt, 3), num(lon.dt, 3), 'Δt'],
      ['Апріорна оцінка (predict), °', lat.predicted.toFixed(7), lon.predicted.toFixed(7), 'x⁻'],
      ['Вимірювання, °', lat.measured.toFixed(7), lon.measured.toFixed(7), 'z'],
      ['Інновація, °', lat.innovation.toExponential(3), lon.innovation.toExponential(3), 'z − x⁻'],
      ['Інновація, м', num(lat.innovation * 111_320, 2), num(lon.innovation * 111_320, 2), '—'],
      ['Підсилення за координатою', num(lat.gainPosition, 4), num(lon.gainPosition, 4), 'K₀'],
      ['Підсилення за швидкістю', num(lat.gainVelocity, 4), num(lon.gainVelocity, 4), 'K₁'],
      ['Апостеріорна оцінка, °', lat.corrected.toFixed(7), lon.corrected.toFixed(7), 'x⁺'],
      ['Дисперсія до корекції', lat.pBefore.toExponential(3), lon.pBefore.toExponential(3), 'P⁻'],
      ['Дисперсія після корекції', lat.pAfter.toExponential(3), lon.pAfter.toExponential(3), 'P⁺'],
    ];
    return {
      id: '2.2',
      title: `Числовий приклад одного кроку фільтра Калмана (борт ${String(vehicleId)})`,
      source: 'experiment',
      columns,
      rows,
      samples: trace.frames,
      note: `Знімок останнього такту після ${trace.frames} оброблених кадрів — фільтр уже в усталеному режимі.`,
    };
  }

  /** 3.1 — авторський текст. */
  private stackComparison(): ReportTable {
    return {
      id: '3.1',
      title: 'Порівняння технологічного стека',
      source: 'manual',
      columns: ['Шар', 'Обрано', 'Альтернатива', 'Обґрунтування вибору'],
      rows: [
        ['Сервер', 'NestJS (TypeScript)', 'Express, Fastify «голими»', 'Модульний DI дозволяє ізолювати конвеєр обробки від транспорту й симулятора'],
        ['Контракт API', 'Спільні типи + zod', 'OpenAPI-генерація', 'Один контракт компілюється і на сервері, і в клієнті — розбіжність неможлива'],
        ['Транспорт подій', 'WebSocket (socket.io)', 'SSE, HTTP-полінг', 'Двобічність потрібна для диспетчерських команд'],
        ['Клієнт', 'React + Vite', 'Angular, Vue', 'Швидка збірка й типова інтеграція зі спільними типами'],
        ['Візуалізація мережі', 'Власна SVG-мнемосхема', 'Leaflet / MapLibre', 'Не потрібні тайли й зовнішні сервіси; повний контроль над шаром даних'],
        ['Графіки', 'Recharts', 'Chart.js, D3 напряму', 'Декларативний API, достатній для часових рядів'],
      ],
      note: 'Чернетка за матеріалами розділу 3.1 — призначена для ручного редагування.',
    };
  }

  /** 3.2 — похибки фільтрації відносно еталона симулятора. */
  private filteringErrors(snap: ReturnType<ExperimentService['snapshot']>): ReportTable {
    const p = snap.position;
    const rows = p.samples
      ? [
          ['СКВ похибки (RMSE), м', num(p.rmseRaw), num(p.rmseFiltered), num(p.improvement) + '×'],
          ['Середня абсолютна (MAE), м', num(p.maeRaw), num(p.maeFiltered), num(p.maeFiltered > 0 ? p.maeRaw / p.maeFiltered : 0) + '×'],
          ['Максимальна похибка, м', num(p.maxRaw), num(p.maxFiltered), num(p.maxFiltered > 0 ? p.maxRaw / p.maxFiltered : 0) + '×'],
        ]
      : [];
    return {
      id: '3.2',
      title: 'Похибки фільтрації координат',
      source: 'experiment',
      columns: ['Показник', 'Сира координата', 'Після фільтра', 'Виграш K_ф'],
      rows,
      samples: p.samples,
      note: p.samples
        ? `Еталон — істинне положення борту до накладання шуму (${p.samples} кадрів). Кадри з навмисно внесеними несправностями виключено, щоб не змішувати похибку фільтра з реакцією на викид.`
        : 'Немає вибірки: запустіть симуляцію та зачекайте кілька десятків кадрів.',
    };
  }

  /** 3.3 — повнота і точність детекторів проти ін'єкцій симулятора. */
  private detectionQuality(snap: ReturnType<ExperimentService['snapshot']>): ReportTable {
    const rows = snap.detection.map((d) => [
      d.code,
      String(d.tp),
      String(d.fp),
      String(d.fn),
      pct(d.precision),
      pct(d.recall),
    ]);
    for (const u of snap.unmatched) {
      rows.push([`${u.code} (без еталона)`, '—', '—', '—', '—', `спрацювань: ${u.n}`]);
    }
    const injected = snap.detection.reduce((s, d) => s + d.tp + d.fn, 0);
    return {
      id: '3.3',
      title: 'Якість виявлення аномалій',
      source: 'experiment',
      columns: ['Код', 'TP', 'FP', 'FN', 'Точність', 'Повнота'],
      rows,
      samples: injected,
      note: injected
        ? `Еталон — момент навмисної ін’єкції несправності симулятором (${injected} подій). Детектору дається 2 кадри на реакцію. OFF_ROUTE і STALE_FRAME симулятором не інжектуються, тому показані окремо як спрацювання без еталона.`
        : 'Немає подій: надішліть «Ін’єкція несправності» з панелі диспетчера — GPS_JUMP або SPEED_SPIKE.',
    };
  }

  /** 3.4 — похибка ETA за горизонтами прогнозу. */
  private etaErrors(snap: ReturnType<ExperimentService['snapshot']>): ReportTable {
    const total = snap.eta.reduce((s, b) => s + b.samples, 0);
    const rows = snap.eta.map((b) => [
      b.label,
      String(b.samples),
      b.samples ? num(b.maeSeconds, 1) : '—',
      b.samples ? num(b.biasSeconds, 1) : '—',
    ]);
    return {
      id: '3.4',
      title: 'Похибки ETA за горизонтами прогнозу',
      source: 'experiment',
      columns: ['Горизонт', 'Спостережень', 'MAE, с', 'Систематичний зсув, с'],
      rows,
      samples: total,
      note: total
        ? 'Прогноз фіксується в момент видачі, фактичне прибуття — за перетином еталонної відстані вздовж маршруту. Додатний зсув означає, що борт прибув пізніше за прогноз.'
        : 'Немає завершених прогнозів: потрібно, щоб борт доїхав до зупинки після видачі ETA (десятки секунд руху).',
    };
  }

  /** 3.5 — продуктивність конвеєра. */
  private performance(snap: ReturnType<ExperimentService['snapshot']>): ReportTable {
    const perf = snap.performance;
    const perMinute = snap.collectingSeconds > 0 ? (snap.framesSeen / snap.collectingSeconds) * 60 : 0;
    return {
      id: '3.5',
      title: 'Продуктивність конвеєра обробки',
      source: 'experiment',
      columns: ['Показник', 'Значення'],
      rows: [
        ['Оброблено кадрів', String(snap.framesSeen)],
        ['Відхилено кадрів (STALE_FRAME)', String(snap.framesRejected)],
        ['Тривалість заміру, с', String(snap.collectingSeconds)],
        ['Кадрів за хвилину', num(perMinute, 1)],
        ['Середній час обробки, мс', num(perf.avgMs, 3)],
        ['95-й перцентиль, мс', num(perf.p95Ms, 3)],
        ['Максимум, мс', num(perf.maxMs, 3)],
      ],
      samples: perf.samples,
      note: `Час вимірюється навколо PipelineService.process() (${perf.samples} останніх кадрів у вибірці перцентилів).`,
    };
  }
}
