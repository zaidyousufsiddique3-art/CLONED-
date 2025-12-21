
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, UserRole } from '../types';
import { loginUser, logoutUser, registerUser, mapUser } from '../firebase/auth';
import { auth } from '../firebase/firebaseConfig';
import { updateUserProfile } from '../firebase/userService';
import { subscribeToNotifications } from '../firebase/notificationService';
import { onAuthStateChanged } from '@firebase/auth';

type Theme = 'light' | 'dark';

interface AuthContextType {
  user: User | null;
  login: (identifier: string, pass: string, role: UserRole) => Promise<boolean>;
  logout: () => void;
  registerUser: (user: User, pass: string) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  theme: Theme;
  toggleTheme: () => void;
  unreadNotifications: number;
  refreshNotifications: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<Theme>('dark');
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const appUser = await mapUser(firebaseUser);
          setUser(appUser);
        } catch (error) {
          console.error("Failed to map user profile:", error);
          // If permission denied, we might be logged in but can't read profile. 
          // Logout to reset state or handle gracefully.
          setUser(null);
        }
      } else {
        setUser(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Notification Listener
  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }
    const unsubscribe = subscribeToNotifications(user.id, (notifs) => {
      setUnreadNotifications(notifs.filter(n => !n.isRead).length);
    });
    return () => unsubscribe();
  }, [user]);

  // Theme Logic: Force Midnight Mode as default
  useEffect(() => {
    const savedTheme = localStorage.getItem('edudocs_theme') as Theme;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      setTheme('dark');
    }
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('edudocs_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const handleLogin = async (identifier: string, pass: string, role: UserRole): Promise<boolean> => {
    try {
      const loggedInUser = await loginUser(identifier, pass, role);
      setUser(loggedInUser);
      return true;
    } catch (e) {
      console.error("Login Failed", e);
      throw e; // Propagate error to UI
    }
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
  };

  const handleRegister = async (newUser: User, pass: string) => {
    await registerUser(newUser, pass);
  };

  const handleUpdateUser = async (updatedUser: User) => {
    await updateUserProfile(updatedUser.id, updatedUser);
    setUser(updatedUser); // Optimistic update
  };

  const refreshNotifications = useCallback(() => {
    // Real-time listener handles updates, this is a placeholder for interface compatibility
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      login: handleLogin,
      logout: handleLogout,
      registerUser: handleRegister,
      updateUser: handleUpdateUser,
      theme,
      toggleTheme,
      unreadNotifications,
      refreshNotifications
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
