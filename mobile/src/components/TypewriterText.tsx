import { useEffect, useRef, useState } from 'react';
import { Text, StyleProp, TextStyle } from 'react-native';
import { computeTypewriterStep } from '../lib/chat/render/typewriter';

interface TypewriterTextProps {
  /** The text content to animate. It may grow while streaming. */
  text: string;
  style?: StyleProp<TextStyle>;
  /** Approximate delay between word starts. */
  wordDelay?: number;
  /** Kept for API compatibility; character reveal does not fade tokens. */
  fadeDuration?: number;
  skipAnimation?: boolean;
  onComplete?: () => void;
  /** Whether catching up to the current text should finish the whole animation. */
  completeWhenCaughtUp?: boolean;
  onProgress?: () => void;
}

export function TypewriterText({
  text,
  style,
  wordDelay = 50,
  skipAnimation = false,
  onComplete,
  completeWhenCaughtUp = true,
  onProgress,
}: TypewriterTextProps) {
  const [displayedText, setDisplayedText] = useState(skipAnimation ? text : '');
  const displayedTextRef = useRef(skipAnimation ? text : '');
  const targetTextRef = useRef(text);
  const isMountedRef = useRef(true);
  const isAnimatingRef = useRef(false);
  const completionNotifiedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  const onProgressRef = useRef(onProgress);
  const completeWhenCaughtUpRef = useRef(completeWhenCaughtUp);

  onCompleteRef.current = onComplete;
  onProgressRef.current = onProgress;
  completeWhenCaughtUpRef.current = completeWhenCaughtUp;

  useEffect(() => {
    targetTextRef.current = text;
    completionNotifiedRef.current = false;

    if (skipAnimation) {
      displayedTextRef.current = text;
      setDisplayedText(text);
      if (completeWhenCaughtUp) onCompleteRef.current?.();
      return;
    }

    if (!isAnimatingRef.current) {
      isAnimatingRef.current = true;
      scheduleNextTick(0);
    }
    // scheduleNextTick is intentionally a local function below; its refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, skipAnimation, completeWhenCaughtUp]);

  useEffect(() => {
    if (
      completeWhenCaughtUp &&
      !isAnimatingRef.current &&
      displayedTextRef.current === targetTextRef.current &&
      targetTextRef.current.length > 0 &&
      !completionNotifiedRef.current
    ) {
      completionNotifiedRef.current = true;
      onCompleteRef.current?.();
    }
  }, [completeWhenCaughtUp, text]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const scheduleNextTick = (delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;

      const target = targetTextRef.current;
      const current = displayedTextRef.current;
      const step = computeTypewriterStep(current, target, wordDelay);

      if (step.kind === 'caught-up') {
        isAnimatingRef.current = false;
        if (completeWhenCaughtUpRef.current && target.length > 0 && !completionNotifiedRef.current) {
          completionNotifiedRef.current = true;
          onCompleteRef.current?.();
        }
        return;
      }

      displayedTextRef.current = step.text;
      setDisplayedText(step.text);
      onProgressRef.current?.();

      scheduleNextTick(step.delayMs);
    }, delay);
  };

  return <Text style={style}>{skipAnimation ? text : displayedText}</Text>;
}
