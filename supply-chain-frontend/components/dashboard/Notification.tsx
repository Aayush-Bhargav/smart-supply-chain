'use client';

import React from 'react';
import { CheckCircle, X } from 'lucide-react';

interface NotificationProps {
  show: boolean;
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onClose: () => void;
  autoClose?: boolean;
  duration?: number;
}

export default function Notification({ 
  show, 
  message, 
  type = 'success', 
  onClose, 
  autoClose = true, 
  duration = 8000 
}: NotificationProps) {
  // Auto-close notification
  React.useEffect(() => {
    if (show && autoClose) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [show, autoClose, duration, onClose]);

  if (!show) return null;

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-white';
      case 'info':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-green-500 text-white';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 mr-2" />;
      case 'error':
        return <CheckCircle className="w-5 h-5 mr-2" />;
      case 'warning':
        return <CheckCircle className="w-5 h-5 mr-2" />;
      case 'info':
        return <CheckCircle className="w-5 h-5 mr-2" />;
      default:
        return <CheckCircle className="w-5 h-5 mr-2" />;
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <div className={`${getStyles()} px-6 py-3 rounded-lg shadow-lg animate-pulse flex items-center`}>
        {getIcon()}
        <span className="flex-1">{message}</span>
        <button
          onClick={onClose}
          className="ml-4 hover:opacity-80 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
