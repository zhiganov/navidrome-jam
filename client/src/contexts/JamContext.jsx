import { createContext, useContext, useRef, useEffect } from 'react';
import JamClient from '../services/jamClient';

const JamContext = createContext(null);

export function JamProvider({ children }) {
  const jamServerUrl = import.meta.env.VITE_JAM_SERVER_URL || 'http://localhost:3001';

  // Use useRef to maintain a stable instance across renders
  // but recreate on mount (important for hot-reload cleanup)
  const jamClientRef = useRef(null);

  if (!jamClientRef.current) {
    jamClientRef.current = new JamClient(jamServerUrl);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (jamClientRef.current) {
        jamClientRef.current.disconnect();
      }
    };
  }, []);

  return (
    <JamContext.Provider value={jamClientRef.current}>
      {children}
    </JamContext.Provider>
  );
}

export function useJam() {
  const context = useContext(JamContext);
  if (!context) {
    throw new Error('useJam must be used within a JamProvider');
  }
  return context;
}
