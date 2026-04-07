'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin } from 'lucide-react';

interface CityAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  onSelect?: (city: string) => void;
}

const CityAutocomplete: React.FC<CityAutocompleteProps> = ({
  value,
  onChange,
  placeholder,
  onSelect
}) => {
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
    if (value.trim() === '') {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const filtered = cities.filter(city =>
      city.toLowerCase().startsWith(value.toLowerCase())
    ).slice(0, 10); // Limit to 10 suggestions

    setSuggestions(filtered);
    setIsOpen(filtered.length > 0);
  }, [value, cities]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleSuggestionClick = (city: string) => {
    onChange(city);
    setIsOpen(false);
    if (onSelect) {
      onSelect(city);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
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
    <div className="relative" ref={inputRef}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
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
              onClick={() => handleSuggestionClick(city)}
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
  );
};

export default CityAutocomplete;
