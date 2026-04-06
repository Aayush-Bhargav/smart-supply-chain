'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Package, Clock, Calendar, TrendingUp, Loader2 } from 'lucide-react';
import { RouteRequest, RouteResponse } from '@/types/route';

const CATEGORIES = [
  "Men's Clothing",
  "Women's Clothing", 
  "Electronics",
  "Home & Garden",
  "Sports & Outdoors",
  "Books & Media",
  "Toys & Games",
  "Health & Beauty",
  "Food & Beverages",
  "Automotive"
];

const PRIORITY_LEVELS = [
  { value: "Standard Class", label: "Standard Class (4 days)" },
  { value: "Second Class", label: "Second Class (3 days)" },
  { value: "First Class", label: "First Class (2 days)" },
  { value: "Same Day", label: "Same Day (1 day)" },
];

export default function Home() {
  const router = useRouter();
  const [formData, setFormData] = useState<RouteRequest>({
    source_city: '',
    target_city: '',
    category_name: CATEGORIES[0],
    quantity: 1,
    priority_level: "Standard Class",
    dispatch_date: new Date().toISOString().slice(0, 16),
    scheduled_days: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('http://localhost:8000/find_route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to find route');
      }

      const data = await res.json();
      
      // Redirect to route page with data
      const encodedData = encodeURIComponent(JSON.stringify(data));
      router.push(`/route?data=${encodedData}`);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof RouteRequest, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold gradient-text mb-3">
            Supply Chain Route Optimizer
          </h1>
          <p className="text-xl text-gray-600 font-medium">
            AI-powered route optimization for global logistics
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Form Section */}
          <div className="space-y-6">
            <div className="card p-8 hover-lift">
              <h2 className="text-3xl font-bold mb-8 flex items-center gradient-text">
                <Package className="mr-3 text-blue-600" size={32} />
                Route Configuration
              </h2>

              <form onSubmit={handleSubmit} className="form-section">
                {/* Source City */}
                <div>
                  <label className="form-label">
                    <MapPin className="inline w-5 h-5 mr-2 text-blue-600" />
                    Source City
                  </label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    placeholder="e.g., New York"
                    value={formData.source_city}
                    onChange={(e) => handleInputChange('source_city', e.target.value)}
                  />
                </div>

                {/* Target City */}
                <div>
                  <label className="form-label">
                    <MapPin className="inline w-5 h-5 mr-2 text-blue-600" />
                    Target City
                  </label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    placeholder="e.g., Los Angeles"
                    value={formData.target_city}
                    onChange={(e) => handleInputChange('target_city', e.target.value)}
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="form-label">
                    <Package className="inline w-5 h-5 mr-2 text-blue-600" />
                    Product Category
                  </label>
                  <select
                    className="input-field"
                    value={formData.category_name}
                    onChange={(e) => handleInputChange('category_name', e.target.value)}
                  >
                    {CATEGORIES.map(category => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quantity and Priority */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.1"
                      required
                      className="input-field"
                      value={formData.quantity}
                      onChange={(e) => handleInputChange('quantity', parseFloat(e.target.value))}
                    />
                  </div>

                  <div>
                    <label className="form-label">
                      <TrendingUp className="inline w-5 h-5 mr-2 text-blue-600" />
                      Priority Level
                    </label>
                    <select
                      className="input-field"
                      value={formData.priority_level}
                      onChange={(e) => handleInputChange('priority_level', e.target.value)}
                    >
                      {PRIORITY_LEVELS.map(priority => (
                        <option key={priority.value} value={priority.value}>
                          {priority.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Dispatch Date */}
                <div>
                  <label className="form-label">
                    <Calendar className="inline w-5 h-5 mr-2 text-blue-600" />
                    Dispatch Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    className="input-field"
                    value={formData.dispatch_date}
                    onChange={(e) => handleInputChange('dispatch_date', e.target.value)}
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="btn-primary w-full flex items-center justify-center text-lg"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                      Finding Optimal Route<span className="loading-dots"></span>
                    </>
                  ) : (
                    'Find Route'
                  )}
                </button>
              </form>

              {/* Error Display */}
              {error && (
                <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                  <p className="text-red-700 font-semibold">Error: {error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Map Section */}
          <div className="card p-6 h-[600px] hover-lift">
            <h2 className="text-3xl font-bold mb-6 gradient-text">Route Visualization</h2>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="w-16 h-16 animate-spin text-blue-600 mx-auto mb-6" />
                  <p className="text-gray-600 text-lg font-medium">Calculating optimal route<span className="loading-dots"></span></p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-gray-500">
                  <MapPin className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Configure route parameters and submit to see visualization</p>
                  <p className="text-sm mt-2">Your route will appear on a dedicated page with detailed analysis</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
