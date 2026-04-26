'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, Search } from 'lucide-react';

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

  // Load cities
  useEffect(() => {
    fetch('/data/unique_cities.txt')
      .then(response => response.text())
      .then(text => {
        const cityList = text.split('\n').filter(city => city.trim());
        setCities(cityList);
      })
      .catch(error => console.error('Error loading cities:', error));
  }, []);

  // Filter cities logic
  useEffect(() => {
    // CRITICAL: If the current value exactly matches a city in the list, 
    // we assume it's already "selected" and close the box.
    if (value.trim() === '' || cities.includes(value)) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const filtered = cities.filter(city =>
      city.toLowerCase().startsWith(value.toLowerCase())
    ).slice(0, 8); 

    setSuggestions(filtered);
    setIsOpen(filtered.length > 0);
  }, [value, cities]);

  // The Fix: Explicitly close and clear suggestions
  const handleSuggestionClick = (city: string) => {
    setIsOpen(false);
    setSuggestions([]); // Clear suggestions immediately
    onChange(city); 
    if (onSelect) onSelect(city);
  };

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={inputRef}>
      <div className="relative group">
        <MapPin className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 transition-colors duration-200 ${isOpen ? 'text-sky-400' : 'text-zinc-500'}`} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setIsOpen(false);
            if (e.key === 'Enter' && suggestions.length > 0) handleSuggestionClick(suggestions[0]);
          }}
          placeholder={placeholder}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          // Removed focus-ring and purple glow; set border to sky-400 on focus
          className="w-full bg-white/10 border border-zinc-800 text-zinc-200 text-sm rounded-xl pl-10 pr-4 py-3 outline-none transition-all duration-200 placeholder:text-zinc-5y00 focus:border-sky-400 focus:bg-white/10"
        />
      </div>
      
      {isOpen && suggestions.length > 0 && (
        <div 
          className="absolute z-[100] w-full mt-2 bg-zinc-900 border border-sky-400/50 rounded-xl shadow-2xl shadow-black overflow-hidden"
          onMouseDown={(e) => e.preventDefault()} 
        >
          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            {suggestions.map((city, index) => (
              <div
                key={index}
                className="px-4 py-2.5 hover:bg-sky-400/10 cursor-pointer flex items-center group transition-colors border-b border-zinc-800 last:border-0"
                onClick={() => handleSuggestionClick(city)}
              >
                <MapPin className="w-3.5 h-3.5 mr-3 text-zinc-600 group-hover:text-sky-400 transition-colors" />
                <span className="text-sm text-zinc-300 group-hover:text-white font-medium">{city}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CityAutocomplete;
