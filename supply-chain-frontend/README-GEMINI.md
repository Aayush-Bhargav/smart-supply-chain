# Gemini AI Integration Setup

## 1. Install Dependencies

```bash
npm install @google/generative-ai
```

## 2. Set Up API Key

Create a `.env.local` file in the root of your project:

```
GEMINI_API_KEY=your_ual_gemini_api_key_here
```

## 3. Update .gitignore

Add `.env.local` to your `.gitignore` file:

```
# Environment variables
.env.local
.env
```

## 4. How It Works

The integration includes:

### Frontend Components:
- **RouteSummary Component**: Displays AI-powered route insights
- **Generate Summary Button**: Triggers AI analysis
- **Loading States**: Shows progress during AI processing

### Backend API:
- **`/api/generate-summary/route.ts`**: Next.js API route
- **Gemini AI Integration**: Uses Google's Generative AI model with Gemini 1.5 Flash model
- **Structured Response**: Returns JSON with route insights

### AI Prompt Strategy:
The system sends a detailed prompt to Gemini AI with:

```
Generate a route summary for the given route. 
Analyze this supply chain route data and provide insights:

Route Data: [JSON route data]

Please provide:
1. Brief overview of the route
2. Cross-dock hubs identification
3. Time analysis between hubs
4. Delay reasons and factors
5. Optimization suggestions

Format as JSON:
{
  "overview": "Brief route overview",
  "crossDockHubs": ["Hub1", "Hub2"],
  "timeAnalysis": ["Analysis point 1", "Analysis point 2"],
  "delayReasons": ["Reason 1", "Reason 2"]
}
```

### Features:
- **Intelligent Analysis**: AI identifies patterns and bottlenecks
- **Cross-Dock Detection**: Automatically finds transfer points
- **Time Insights**: Analyzes transit times between segments
- **Delay Factors**: Identifies reasons for delays
- **Structured Output**: Clean, formatted JSON responses

### Error Handling:
- **Graceful Fallbacks**: If JSON parsing fails, provides text summary
- **API Key Validation**: Checks for missing API keys
- **Error Messages**: User-friendly error reporting

## 5. Usage

1. User submits route form
2. Route is calculated and displayed
3. Click "Generate Summary" button
4. AI analyzes route and displays insights
5. Summary includes overview, hubs, time analysis, and delay factors

## 6. Security Notes

- **API Key Protection**: Use environment variables, never commit to Git
- **Rate Limiting**: Consider implementing rate limiting for production
- **Input Validation**: API validates route data before sending to AI

## 7. Customization

You can modify the prompt in `/api/generate-summary/route.ts` to:
- Change analysis focus
- Add new insight categories
- Modify response format
- Adjust AI behavior for specific use cases
