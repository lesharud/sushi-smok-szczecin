import { useEffect, useRef, useState, useCallback } from "react";
import { errorText } from "./client";
// Sequential polling: no overlapping requests, retries after errors and on focus/reconnect.
export function useResource<T>(
  key: string,
  load: () => Promise<T>,
  interval = 5000,
) {
  const loader = useRef(load);
  loader.current = load;
  const [state, setState] = useState<{
    key: string;
    data: T | null;
    error: string;
    updated: number;
  }>({ key, data: null, error: "", updated: 0 });
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    setState({ key, data: null, error: "", updated: 0 });
  }, [key]);
  useEffect(() => {
    let alive = true,
      running = false;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (running || !alive) return;
      clearTimeout(timer);
      running = true;
      try {
        const data = await loader.current();
        if (alive) setState({ key, data, error: "", updated: Date.now() });
      } catch (e) {
        if (alive) setState((s) => ({ ...s, error: errorText(e) }));
      } finally {
        running = false;
        if (alive && interval > 0) timer = setTimeout(run, interval);
      }
    };
    const wake = () => {
      if (interval > 0 && !document.hidden) void run();
    };
    void run();
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [key, version, interval]);
  return {
    ...(state.key === key ? state : { key, data: null, error: "", updated: 0 }),
    refresh,
  };
}
