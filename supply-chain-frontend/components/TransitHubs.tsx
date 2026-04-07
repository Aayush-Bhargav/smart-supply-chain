'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';

interface TransitHubsProps {
  value: string[];
  onChange: (hubs: string[]) => void;
}

const TransitHubs: React.FC<TransitHubsProps> = ({ value, onChange }) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [cities, setCities] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load cities from file
  useEffect(() => {
    fetch('/data/unique_cities.txt')
      .then(response => response.text())
      .then(text => {
        const cityList = text.split('\n').filter(city => city.trim());
        setCities(cityList);
      })
      .catch(error => console.error('Error loading cities:', error));
  }, []);

  // Filter cities based on input
  useEffect(() => {
    if (inputValue.trim() === '') {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const filtered = cities.filter(city =>
      city.toLowerCase().startsWith(inputValue.toLowerCase()) &&
      !value.includes(city) // Don't show already selected cities
    ).slice(0, 10);

    setSuggestions(filtered);
    setIsOpen(filtered.length > 0);
  }, [inputValue, cities, value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleAddHub = (city: string) => {
    onChange([...value, city]);
    setInputValue('');
    setIsOpen(false);
  };

  const handleRemoveHub = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      // Check if exact match exists
      const exactMatch = cities.find(city =>
        city.toLowerCase() === inputValue.toLowerCase() &&
        !value.includes(city)
      );
      
      if (exactMatch) {
        handleAddHub(exactMatch);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-3">
      <label className="form-label">
        <MapPin className="inline w-5 h-5 mr-2 text-blue-600" />
        Transit Hubs (Cross-dock Cities)
      </label>
      
      {/* Selected Hubs Display */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {value.map((hub, index) => (
            <div
              key={index}
              className="inline-flex items-center bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm"
            >
              <MapPin className="w-3 h-3 mr-1" />
              {hub}
              <button
                type="button"
                onClick={() => handleRemoveHub(index)}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input for adding new hubs */}
      <div className="relative" ref={inputRef}>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Add transit hub city..."
            className="input-field pl-10"
            onFocus={() => {
              if (suggestions.length > 0) setIsOpen(true);
            }}
          />
        </div>
        
        {isOpen && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((city, index) => (
              <div
                key={index}
                className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
                onClick={() => handleAddHub(city)}
              >
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-2 text-gray-400" />
                  <span className="text-sm">{city}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <p className="text-sm text-gray-600 mt-1">
        Add intermediate cities for cross-docking. Cities will be visited in order.
      </p>
    </div>
  );
};

export default TransitHubs;
