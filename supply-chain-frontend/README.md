# Supply Chain Frontend

A beautiful Next.js frontend for the Supply Chain Route Optimizer API.

## 🚀 Features

- **Beautiful UI**: Modern, responsive design with Tailwind CSS
- **Interactive Map**: Real-time route visualization with Leaflet
- **Transport Mode Colors**: Different colors for Truck, Ocean, Air, Rail
- **Hover Details**: Click on route segments to see details
- **Loading States**: Elegant loading animations
- **Error Handling**: User-friendly error messages

## 🛠️ Tech Stack

- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Leaflet**: Interactive maps
- **Lucide React**: Beautiful icons

## 📦 Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## 🔧 Configuration

Copy the example env file and set your backend URL plus Firebase values:

```bash
cp .env.example .env.local
```

The frontend reads the backend URL from `NEXT_PUBLIC_API_BASE_URL`.

## 📍 API Integration

The frontend sends requests to `/find_route` endpoint with:

```typescript
interface RouteRequest {
  source_city: string;
  target_city: string;
  category_name: string;
  quantity: number;
  priority_level: string;
  dispatch_date: string;
  scheduled_days: number | null;
}
```

And receives route visualization data:

```typescript
interface RouteResponse {
  source: string;
  target: string;
  total_transit_days: number;
  route: RouteSegment[];
}

interface RouteSegment {
  from: string;
  to: string;
  mode: string;
  days: number;
}
```

## 🎨 Transport Mode Colors

- **Truck**: Amber (#f59e0b)
- **Ocean**: Blue (#3b82f6)
- **Air**: Emerald (#10b981)
- **Rail**: Violet (#8b5cf6)

## 🌍 Map Features

- **Interactive**: Pan, zoom, click on segments
- **Responsive**: Works on all screen sizes
- **Popups**: Hover over routes for details
- **Markers**: City markers with information

## 📱 Responsive Design

- Mobile-friendly layout
- Touch interactions
- Adaptive map sizing

## 🚀 Deployment

Ready for deployment on Vercel with an env-driven backend URL.
