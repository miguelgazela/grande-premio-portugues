import { useEffect, useState } from 'react';
import { getApi, type Api } from '../lib/api';

export function useApi(): Api | null {
  const [api, setApi] = useState<Api | null>(null);
  useEffect(() => {
    let alive = true;
    void getApi().then((a) => alive && setApi(a));
    return () => {
      alive = false;
    };
  }, []);
  return api;
}
