import { useState, useCallback, useEffect } from 'react';
import type { ManthanaDocumentAST } from '../types/ast';

export interface HistoryEntry {
  id: string;
  label: string;
  time: number;
  snapshot: ManthanaDocumentAST;
}

export function useDocumentHistory(initial: ManthanaDocumentAST) {
  const [history, setHistory] = useState<HistoryEntry[]>([
    { id: 'init', label: 'Initial Document', time: Date.now(), snapshot: JSON.parse(JSON.stringify(initial)) }
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ast, setAst] = useState<ManthanaDocumentAST>(initial);

  const pushHistory = useCallback((newAst: ManthanaDocumentAST, label: string = 'Edit') => {
    setHistory((prev) => {
      const trimmed = prev.slice(0, currentIndex + 1);
      const entry: HistoryEntry = { id: `h-${Date.now()}`, label, time: Date.now(), snapshot: JSON.parse(JSON.stringify(newAst)) };
      return [...trimmed, entry].slice(-50); // max 50 snapshots
    });
    setCurrentIndex((prev) => Math.min(prev + 1, 49));
    setAst(newAst);
  }, [currentIndex]);

  const undo = useCallback(() => {
    if (currentIndex <= 0) return;
    const newIndex = currentIndex - 1;
    setCurrentIndex(newIndex);
    setAst(JSON.parse(JSON.stringify(history[newIndex].snapshot)));
  }, [currentIndex, history]);

  const redo = useCallback(() => {
    if (currentIndex >= history.length - 1) return;
    const newIndex = currentIndex + 1;
    setCurrentIndex(newIndex);
    setAst(JSON.parse(JSON.stringify(history[newIndex].snapshot)));
  }, [currentIndex, history]);

  const restoreSnapshot = useCallback((idx: number) => {
    if (idx < 0 || idx >= history.length) return;
    setCurrentIndex(idx);
    setAst(JSON.parse(JSON.stringify(history[idx].snapshot)));
  }, [history]);

  // Keyboard shortcut handlers
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  return { ast, setAst: pushHistory, undo, redo, history, currentIndex, restoreSnapshot, canUndo: currentIndex > 0, canRedo: currentIndex < history.length - 1 };
}
