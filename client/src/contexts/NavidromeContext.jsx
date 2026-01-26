import { createContext, useContext, useRef, useEffect } from 'react';
import NavidromeClient from '../services/navidrome';

const NavidromeContext = createContext(null);

export function NavidromeProvider({ children }) {
  const navidromeUrl = import.meta.env.VITE_NAVIDROME_URL || 'http://localhost:4533';

  // Use useRef to maintain a stable instance across renders
  // but recreate on mount (important for hot-reload cleanup)
  const navidromeRef = useRef(null);

  if (!navidromeRef.current) {
    navidromeRef.current = new NavidromeClient(navidromeUrl);
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (navidromeRef.current) {
        navidromeRef.current.logout();
      }
    };
  }, []);

  return (
    <NavidromeContext.Provider value={navidromeRef.current}>
      {children}
    </NavidromeContext.Provider>
  );
}

export function useNavidrome() {
  const context = useContext(NavidromeContext);
  if (!context) {
    throw new Error('useNavidrome must be used within a NavidromeProvider');
  }
  return context;
}
