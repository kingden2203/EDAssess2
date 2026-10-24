import { useEffect, useRef, useState } from 'react';

/**
 * Timer na nakabase sa orasan (Date.now), hindi sa bilang ng tick, kaya tama pa rin
 * kahit na-throttle ang background tab. Walang stale closure dahil ref ang onExpire.
 *
 * ready      : true lang kapag loaded na ang exam AT ang exam config
 * autoSubmit : galing sa config.autoSubmit
 * onExpire   : tinatawag nang isang beses kapag 0 na (autoSubmit = true)
 */
export default function useExamTimer({ durationMin, autoSubmit, ready, onExpire }) {
  const endAtRef = useRef(null);
  const firedRef = useRef(false);
  const expireRef = useRef(onExpire);
  const [timeLeft, setTimeLeft] = useState(durationMin * 60);
  const [timeUp, setTimeUp] = useState(false);

  useEffect(() => { expireRef.current = onExpire; });

  useEffect(() => {
    if (!ready) return undefined;
    if (endAtRef.current === null) endAtRef.current = Date.now() + durationMin * 60000;

    const tick = () => {
      const left = Math.max(0, Math.ceil((endAtRef.current - Date.now()) / 1000));
      setTimeLeft(left);
      if (left === 0 && !firedRef.current) {
        firedRef.current = true;
        setTimeUp(true);
        if (autoSubmit) expireRef.current?.(true); // true = auto_submit flag
      }
    };

    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [ready, durationMin, autoSubmit]);

  return { timeLeft, timeUp };
}
