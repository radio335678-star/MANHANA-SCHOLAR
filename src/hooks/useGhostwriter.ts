import { useState, useEffect, useRef, useCallback } from 'react';
import { generateWithGemini25Flash } from '../services/aiStreamer';

export function useGhostwriter(currentText: string, enabled: boolean = true) {
  const [ghostText, setGhostText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerCompletion = useCallback(async (text: string) => {
    if (!text || text.trim().length < 15) {
      setGhostText('');
      return;
    }

    try {
      setIsLoading(true);
      const systemInst = "You are Q108 Ghostwriter AI Copilot. Complete the sentence or paragraph in 5 to 12 words max. Return ONLY the continuation text with no quotes or preamble.";
      const prompt = `Complete the following sentence cleanly:\n"${text}"`;

      const completion = await generateWithGemini25Flash(prompt, systemInst);
      if (completion && completion.trim()) {
        setGhostText(completion.trim());
      }
    } catch (err) {
      console.warn("Ghostwriter pause completion skipped:", err);
      setGhostText('');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setGhostText('');
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    setGhostText('');

    // Trigger AI prediction after 1.5s typing pause
    timerRef.current = setTimeout(() => {
      triggerCompletion(currentText);
    }, 1500);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentText, enabled, triggerCompletion]);

  const acceptGhostText = () => {
    const accepted = ghostText;
    setGhostText('');
    return accepted;
  };

  const dismissGhostText = () => {
    setGhostText('');
  };

  return { ghostText, isLoading, acceptGhostText, dismissGhostText };
}
