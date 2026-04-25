'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, LucideIcon } from 'lucide-react';

interface Option {
  value: string;
  label: string;
}

interface CustomSelectProps {
  label: string;
  icon: LucideIcon;
  value: any;
  options: (string | Option)[];
  onChange: (value: string) => void;
  placeholder?: string;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  label,
  icon: Icon,
  value,
  options,
  onChange,
  placeholder = "Select an option"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Find label for display if options are objects
  const displayLabel = options.find(opt => 
    typeof opt === 'string' ? opt === value : opt.value === value
  );
  
  const currentLabel = typeof displayLabel === 'string' 
    ? displayLabel 
    : displayLabel?.label || value || placeholder;

  return (
    <div className="space-y-2 w-full" ref={containerRef}>
      <label className="block text-xs font-semibold uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5 ">
        <Icon className="w-3.5 h-3.5 text-sky-400" />
        {label} 
      </label>

      <div className="relative">
        {/* Trigger Box */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={`
            w-full flex items-center justify-between cursor-pointer px-4 py-3 rounded-xl border transition-all duration-200 outline-none
            text-zinc-200 backdrop-blur-lg
            ${isOpen ? 'border-sky-400' : 'border-zinc-800'} 
          `}
        >
          <span className={`text-sm truncate ${!value && 'text-zinc-500'}`}>
            {currentLabel}
          </span>
          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-300 ${isOpen ? 'rotate-180 text-sky-400' : ''}`} />
        </div>

        {/* Dropdown Menu */}
        {isOpen && (
          <div 
            className="absolute z-[110] w-full mt-2 bg-zinc-900 backdrop-blur-xl border border-sky-400/30 rounded-xl shadow-2xl shadow-black overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onMouseDown={(e) => e.preventDefault()} // Prevent blur issues
          >
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {options.map((option, index) => {
                const val = typeof option === 'string' ? option : option.value;
                const lab = typeof option === 'string' ? option : option.label;
                const isSelected = value === val;

                return (
                  <div
                    key={index}
                    onClick={() => {
                      onChange(val);
                      setIsOpen(false);
                    }}
                    className={`
                      px-4 py-2.5 text-sm cursor-pointer transition-colors border-b border-zinc-800/50 last:border-0
                      ${isSelected ? 'text-sky-400 bg-sky-400/5' : 'text-zinc-400 hover:bg-sky-400/10 hover:text-white'}
                    `}
                  >
                    {lab}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomSelect;