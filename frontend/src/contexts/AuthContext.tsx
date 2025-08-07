import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, AuthResponse } from '../types';
import { authAPI } from '../lib/api';
import { initializeEncryptionKeys, getPublicKey, storePublicKey } from '../utils/encryption';
import toast from 'react-hot-toast';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => void;
  googleLogin: (idToken: string) => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('access_token');
      const savedUser = localStorage.getItem('user');

      console.log('Initializing auth...');
      console.log('Token exists:', !!token);
      console.log('Saved user exists:', !!savedUser);

      if (token && savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          console.log('Parsed user data:', userData);
          setUser(userData);
          
          // Try to verify token, but don't clear auth if it fails
          // This prevents losing authentication on page refresh due to network issues
          try {
            await authAPI.getCurrentUser();
            console.log('Token verification successful');
          } catch (verifyError) {
            console.warn('Token verification failed, but keeping user logged in:', verifyError);
            // Don't clear auth data - user can still use the app
            // Token will be validated on actual API calls
          }
        } catch (error) {
          console.error('Error parsing saved user data:', error);
          // Only clear storage if we can't parse the saved data
          localStorage.removeItem('access_token');
          localStorage.removeItem('user');
          setUser(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const saveAuthData = async (authResponse: AuthResponse) => {
    console.log('Saving auth data:', authResponse);
    localStorage.setItem('access_token', authResponse.access_token);
    localStorage.setItem('user', JSON.stringify(authResponse.user));
    setUser(authResponse.user);
    
    // Initialize E2EE keys for the user
    try {
      const keyPair = initializeEncryptionKeys(authResponse.user.id);
      console.log('E2EE keys initialized for user:', authResponse.user.id);
      
      // Sync public key with server if it's different
      const existingPublicKey = getPublicKey(authResponse.user.id);
      if (existingPublicKey && existingPublicKey !== authResponse.user.public_key) {
        await syncPublicKeyWithServer(authResponse.user.id, existingPublicKey);
      }
    } catch (error) {
      console.error('Error initializing E2EE keys:', error);
    }
  };

  const syncPublicKeyWithServer = async (userId: string, publicKey: string) => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      
      await fetch(`${API_BASE}/users/public-key`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ public_key: publicKey }),
      });
      console.log('Public key synced with server');
    } catch (error) {
      console.error('Error syncing public key with server:', error);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      console.log('Attempting login for:', email);
      const response = await authAPI.login({ email, password });
      console.log('Login response:', response);
      saveAuthData(response);
      toast.success('Successfully logged in!');
    } catch (error: any) {
      console.error('Login error:', error);
      const message = error.response?.data?.detail || 'Login failed';
      toast.error(message);
      throw error;
    }
  };

  const register = async (username: string, email: string, password: string, fullName?: string) => {
    try {
      console.log('Attempting registration for:', email);
      console.log('Registration data:', { username, email, password, fullName });
      
      const response = await authAPI.register({ username, email, password, full_name: fullName });
      console.log('Registration response:', response);
      saveAuthData(response);
      toast.success('Account created successfully!');
    } catch (error: any) {
      console.error('Registration error:', error);
      console.error('Error response:', error.response);
      console.error('Error data:', error.response?.data);
      console.error('Error status:', error.response?.status);
      
      let message = 'Registration failed';
      if (error.response?.data?.detail) {
        message = error.response.data.detail;
      } else if (error.message) {
        message = error.message;
      }
      
      toast.error(message);
      throw error;
    }
  };

  const googleLogin = async (idToken: string) => {
    try {
      const response = await authAPI.googleAuth(idToken);
      saveAuthData(response);
      toast.success('Successfully logged in with Google!');
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Google login failed';
      toast.error(message);
      throw error;
    }
  };

  const logout = () => {
    console.log('Logging out...');
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    setUser(null);
    toast.success('Logged out successfully');
  };

  const updateUser = (updates: Partial<User>) => {
    setUser(prevUser => {
      if (prevUser) {
        return { ...prevUser, ...updates };
      }
      return null;
    });
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    googleLogin,
    updateUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 