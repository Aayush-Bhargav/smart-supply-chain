import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY } from '@/config/gemini';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

interface SummaryRequest {
  route: {
    source: string;
    target: string;
    total_transit_days: number;
    route: Array<{
      from: string;
      to: string;
      mode: string;
      days: number;
      base_time: number;
    }>;
  };
}

export async function POST(request: NextRequest) {
  try {
    const { route }: SummaryRequest = await request.json();

    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }, // Added -preview
  { apiVersion: "v1beta" });

    // Construct the prompt
    const prompt = `Generate a route summary for the given route. 
    Analyze this supply chain route data and provide insights:

    Route Data:
    ${JSON.stringify(route, null, 2)}

    Please provide:
    1. A brief overview of the route (source to destination, total time)
    2. Identify any cross-dock hubs or transfer points
    3. Time analysis between major hubs
    4. Reasons for transit times and any potential delays
    5. Optimize suggestions if applicable

    Format your response as JSON with these keys:
    {
      "overview": "Brief route overview",
      "crossDockHubs": ["Hub1", "Hub2"],
      "timeAnalysis": ["Analysis point 1", "Analysis point 2"],
      "delayReasons": ["Reason 1", "Reason 2"]
    }`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Try to parse JSON response
    let summaryData;
    try {
      // Extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        summaryData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      // Fallback if JSON parsing fails
      summaryData = {
        overview: text.substring(0, 200) + '...',
        crossDockHubs: [],
        timeAnalysis: [text.substring(0, 150) + '...'],
        delayReasons: []
      };
    }

    return NextResponse.json(summaryData);
  } catch (error) {
    console.error('Error generating summary:', error);
    return NextResponse.json(
      { error: 'Failed to generate route summary' },
      { status: 500 }
    );
  }
}
