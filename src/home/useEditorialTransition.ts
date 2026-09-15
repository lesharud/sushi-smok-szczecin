import { useEffect, useRef, useState } from "react";

/** One transaction for image, copy and navigation; no competing transitions. */
export function useEditorialTransition<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const [phase, setPhase] = useState("idle");
  const [direction, setDirection] = useState(1);
  const locked = useRef(false);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const preloadTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(
    () => () => {
      generation.current++;
      clearTimeout(timer.current);
      clearTimeout(preloadTimer.current);
      locked.current = false;
    },
    [],
  );
  async function change(next: T, dir = 1, images: string[] = []) {
    if (locked.current) return;
    locked.current = true;
    const request = ++generation.current;
    setDirection(dir);
    setPhase("loading");
    // Keep the old frame visible until the incoming photography is decoded.
    await Promise.race([
      Promise.all(
        images.map(
          (src) =>
            new Promise<void>((resolve) => {
              const img = new Image();
              img.src = src;
              img
                .decode()
                .catch(() => {})
                .then(resolve);
            }),
        ),
      ),
      new Promise<void>((resolve) => {
        preloadTimer.current = setTimeout(resolve, 4000);
      }),
    ]);
    if (request !== generation.current) return;
    clearTimeout(preloadTimer.current);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(next);
      setPhase("idle");
      locked.current = false;
      return;
    }
    setPhase("out");
    timer.current = setTimeout(() => {
      setValue(next);
      setPhase("in");
      timer.current = setTimeout(() => {
        setPhase("idle");
        locked.current = false;
      }, 480);
    }, 220);
  }
  function reset(next: T) {
    generation.current++;
    clearTimeout(timer.current);
    clearTimeout(preloadTimer.current);
    locked.current = false;
    setValue(next);
    setPhase("idle");
  }
  return {
    value,
    change,
    reset,
    busy: phase !== "idle",
    motion: {
      "data-phase": phase,
      "data-direction": direction < 0 ? "previous" : "next",
    },
  };
}
