'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';

interface TransitHubsProps {
  value: string[];
  onChange: (hubs: string[]) => void;
}

const labelClass = "block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5";

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
    <div className="space-y-4">
      <label className={`${labelClass} flex items-center`}>
        <MapPin className="w-3.5 h-3.5 mr-2 text-sky-400" />
        Transit Hubs 
      </label>

      <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
        Add intermediate cities for cross-docking. Logistics will follow this sequence.
      </p>
      
      {/* Selected Hubs Display: Updated to Midnight & Cyan tags */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {value.map((hub, index) => (
            <div
              key={index}
              className="inline-flex items-center bg-white/10 border border-sky-400/30 text-sky-300 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-tight"
            >
              <MapPin className="w-3 h-3 mr-1.5 opacity-70" />
              {hub}
              <button
                type="button"
                onClick={() => handleRemoveHub(index)}
                className="ml-2.5 p-0.5 rounded-md hover:bg-sky-400/20 text-sky-500 hover:text-sky-300 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
  
      {/* Input for adding new hubs: Styled to match CityAutocomplete */}
      <div className="relative" ref={inputRef}>
        <div className="relative group">
          <MapPin className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 transition-colors duration-200 ${isOpen ? 'text-sky-400' : 'text-zinc-500'}`} />
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Add transit hub city..."
            onFocus={() => suggestions.length > 0 && setIsOpen(true)}
            className="w-full bg-white/10 border border-zinc-800 text-zinc-200 text-sm rounded-xl pl-10 pr-4 py-3 outline-none transition-all duration-200 placeholder:text-zinc-500 focus:border-sky-400 focus:bg-white/10"
          />
        </div>
        
        {/* Dropdown: Styled with Cyan borders and Midnight background */}
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
                  onClick={() => handleAddHub(city)}
                >
                  <MapPin className="w-3.5 h-3.5 mr-3 text-zinc-600 group-hover:text-sky-400 transition-colors" />
                  <span className="text-sm text-zinc-300 group-hover:text-white font-medium">{city}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransitHubs;
