import { useEffect } from 'react';
import type { ManthanaDocumentAST } from '../types/ast';

const DB_NAME = 'ManthanaScholarDB';
const STORE_NAME = 'documents';
const CURRENT_DOC_KEY = 'active_document_session';

export function useIndexedDBSession(
  ast: ManthanaDocumentAST,
  onRestoreSession?: (restoredAst: ManthanaDocumentAST) => void
) {
  // Open DB and save active document session on change
  useEffect(() => {
    if (!ast) return;

    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (e: Event) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({ id: CURRENT_DOC_KEY, ast, updatedAt: Date.now() }, CURRENT_DOC_KEY);
    };
  }, [ast]);

  // Load session from IndexedDB on initial mount
  useEffect(() => {
    if (!onRestoreSession) return;

    const request = indexedDB.open(DB_NAME, 1);
    request.onsuccess = (e: Event) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) return;
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(CURRENT_DOC_KEY);
      getReq.onsuccess = () => {
        if (getReq.result && getReq.result.ast) {
          console.log('[Manthana DB] Restored document session from IndexedDB');
        }
      };
    };
  }, [onRestoreSession]);
}
