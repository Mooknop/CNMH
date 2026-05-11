import React, { createContext, useContext, useState, useCallback } from 'react';

const LoreContext = createContext(null);

export const LoreProvider = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentEntryId, setCurrentEntryId] = useState(null);
  const [history, setHistory] = useState([]);

  const openLore = useCallback((entryId) => {
    setCurrentEntryId(entryId);
    setHistory([]);
    setIsOpen(true);
  }, []);

  const closeLore = useCallback(() => {
    setIsOpen(false);
    setCurrentEntryId(null);
    setHistory([]);
  }, []);

  const navigateTo = useCallback((entryId) => {
    setHistory(prev => currentEntryId ? [...prev, currentEntryId] : prev);
    setCurrentEntryId(entryId);
  }, [currentEntryId]);

  const goBack = useCallback(() => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    setCurrentEntryId(prev);
  }, [history]);

  return (
    <LoreContext.Provider value={{ isOpen, currentEntryId, openLore, closeLore, navigateTo, goBack, canGoBack: history.length > 0 }}>
      {children}
    </LoreContext.Provider>
  );
};

export const useLore = () => {
  const ctx = useContext(LoreContext);
  if (!ctx) throw new Error('useLore must be used within LoreProvider');
  return ctx;
};

export default LoreContext;
