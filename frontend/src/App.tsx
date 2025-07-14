import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ChatPage from './pages/ChatPage';
import LoadingSpinner from './components/LoadingSpinner';

const App: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route 
          path="/login" 
          element={user ? <Navigate to="/chat" replace /> : <LoginPage />} 
        />
        <Route 
          path="/register" 
          element={user ? <Navigate to="/chat" replace /> : <RegisterPage />} 
        />
        <Route 
          path="/chat/*" 
          element={user ? <ChatPage /> : <Navigate to="/login" replace />} 
        />
        <Route 
          path="/" 
          element={<Navigate to={user ? "/chat" : "/login"} replace />} 
        />
      </Routes>
    </div>
  );
};

export default App; 