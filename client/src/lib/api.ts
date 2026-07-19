import type {
  ApiEnvelope,
  ApiErrorShape,
  EndpointKey,
  MethodOf,
  RequestArgs,
  ResponseOf,
} from '@icms/shared';

export class ApiError extends Error {
  readonly code: string;

  constructor(shape: ApiErrorShape) {
    super(shape.message);
    this.code = shape.code;
  }
}

/**
 * Единственная функция сетевого слоя. Ключ — литерал из ApiContract:
 * const-параметр K фиксирует его без ручных аннотаций, а RequestArgs<K>
 * вычисляет кортеж аргументов (params?/body?) прямо из шаблона пути.
 * Вызвать эндпоинт с неверным телом или забыть path-параметр невозможно.
 */
export async function api<const K extends EndpointKey>(
  key: K,
  ...args: RequestArgs<K>
): Promise<ResponseOf<K>> {
  const spaceIdx = key.indexOf(' ');
  const method: MethodOf<K> = key.slice(0, spaceIdx) as MethodOf<K>; // расщепление тем же правилом, что и SplitKey на уровне типов
  const template = key.slice(spaceIdx + 1);
  const hasParams = template.includes(':');

  // Кортеж RequestArgs уже гарантировал форму args; здесь только раскладка по позициям.
  const [first, second] = args as readonly [unknown?, unknown?];
  const params = hasParams ? (first as Readonly<Record<string, string>>) : undefined;
  const body = hasParams ? second : first;

  const path = template.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_m, name: string) =>
    encodeURIComponent(params?.[name] ?? ''),
  );

  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Единственная граница доверия к сети: конверт типизируется ResponseOf<K>.
  const envelope = (await res.json()) as ApiEnvelope<ResponseOf<K>>;
  if (!envelope.ok) throw new ApiError(envelope.error);
  return envelope.data;
}