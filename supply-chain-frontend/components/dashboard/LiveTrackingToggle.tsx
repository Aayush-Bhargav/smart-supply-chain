'use client';

import React from 'react';
import { Zap } from 'lucide-react';

interface LiveTrackingToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  disabled?: boolean;
  size?: 'small' | 'medium' | 'large';
  showLabel?: boolean;
}

export default function LiveTrackingToggle({ 
  enabled, 
  onToggle, 
  disabled = false,
  size = 'medium',
  showLabel = true
}: LiveTrackingToggleProps) {
  
  const getSizeClasses = () => {
    switch (size) {
      case 'small':
        return {
          toggle: 'h-4 w-7',
          dot: 'h-3 w-3',
          dotTranslate: enabled ? 'translate-x-3' : 'translate-x-0.5'
        };
      case 'large':
        return {
          toggle: 'h-8 w-14',
          dot: 'h-6 w-6',
          dotTranslate: enabled ? 'translate-x-6' : 'translate-x-1'
        };
      default: // medium
        return {
          toggle: 'h-6 w-11',
          dot: 'h-4 w-4',
          dotTranslate: enabled ? 'translate-x-5' : 'translate-x-1'
        };
    }
  };

  const sizeClasses = getSizeClasses();

  return (
    <div className="flex items-center space-x-3">
      <Zap className={`w-4 h-4 transition-colors ${enabled ? 'text-yellow-400' : 'text-gray-500'}`} />
      
      {showLabel && (
        <span className="text-sm font-medium text-gray-300 whitespace-nowrap">
          Live Route Decisions
        </span>
      )}
      
      <button
        onClick={() => onToggle(!enabled)}
        disabled={disabled}
        className={`relative inline-flex ${sizeClasses.toggle} items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 ${
          enabled ? 'bg-yellow-500' : 'bg-gray-600'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        role="switch"
        aria-checked={enabled}
        aria-label="Enable live route decisions"
      >
        <span
          className={`inline-block ${sizeClasses.dot} transform rounded-full bg-white shadow-md transition-transform duration-300 ${sizeClasses.dotTranslate}`}
        />
      </button>
      
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full transition-all ${
        enabled
          ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
          : 'bg-gray-700 text-gray-400 border border-gray-600'
      }`}>
        {enabled ? 'ON' : 'OFF'}
      </span>
    </div>
  );
}
