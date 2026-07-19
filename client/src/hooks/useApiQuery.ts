import { useCallback, useEffect, useRef, useState } from 'react';
import type { EndpointKey, RequestArgs, ResponseOf } from '@icms/shared';
import { api, ApiError } from '@/lib/api';

interface QueryState<T> {
  readonly data: T | null;
  readonly error: string | null;
  readonly loading: boolean;
}

/**
 * Generic-хук поверх контракта: тип данных выводится из ключа эндпоинта.
 * useApiQuery('GET /api/routes') → data: readonly RouteDto[] | null.
 */
export function useApiQuery<const K extends EndpointKey>(
  key: K,
  ...args: RequestArgs<K>
): QueryState<ResponseOf<K>> & { readonly refetch: () => void } {
  const [state, setState] = useState<QueryState<ResponseOf<K>>>({
    data: null,
    error: null,
    loading: true,
  });
  const argsRef = useRef(args);
  argsRef.current = args;
  const argsKey = JSON.stringify(args);

  const refetch = useCallback(() => {
    let alive = true;
    setState((prev) => ({ ...prev, loading: true }));
    api(key, ...argsRef.current)
      .then((data) => {
        if (alive) setState({ data, error: null, loading: false });
      })
      .catch((e: unknown) => {
        // unknown в catch: форма ошибки не гарантирована — сужаем вручную
        const message = e instanceof ApiError || e instanceof Error ? e.message : 'Помилка мережі';
        if (alive) setState({ data: null, error: message, loading: false });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, argsKey]);

  useEffect(() => refetch(), [refetch]);

  return { ...state, refetch };
}