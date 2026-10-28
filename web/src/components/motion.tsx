import { animate, motion, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;
const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789_-.';

export function BlurText({ text, delay = 0, className }: { text: string; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  const words = text.split(' ');

  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          aria-hidden="true"
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
          initial={reduce ? false : { opacity: 0, filter: 'blur(12px)', y: 18 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ duration: 0.8, delay: delay + i * 0.09, ease: EASE }}
        >
          {i < words.length - 1 ? `${word} ` : word}
        </motion.span>
      ))}
    </span>
  );
}

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState(reduce ? value : 0);

  useEffect(() => {
    if (reduce) {
      setCurrent(value);
      return;
    }
    const controls = animate(0, value, { duration: 1.2, ease: EASE, onUpdate: (v) => setCurrent(Math.round(v)) });
    return () => controls.stop();
  }, [value, reduce]);

  return <>{format(current)}</>;
}

export function DecryptedText({ text, className, duration = 900 }: { text: string; className?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(text);

  useEffect(() => {
    if (reduce) {
      setShown(text);
      return;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const revealed = Math.floor(((now - started) / duration) * text.length);
      setShown([...text].map((ch, i) => (i < revealed || /[\s/]/.test(ch) ? ch : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length)))).join(''));
      if (revealed < text.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, duration, reduce]);

  return (
    <span className={className} aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </span>
  );
}
