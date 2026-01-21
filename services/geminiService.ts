import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Candle, Signal } from "../types";
import { EXPIRY_DURATION_MS } from "../components/constants";

// ডিফল্ট কি (যদি অন্য কোথাও না পাওয়া যায়)
const DEFAULT_API_KEY = "AIzaSyCJZEhG63RYEu9JiFyDJqR5xNYDoEABXZc";

export const analyzeMarket = async (
  candles: Candle[], 
  assetName: string, 
  indicators: any,
  providedKey?: string // App.tsx থেকে কী পাঠানোর অপশন রাখা হলো
): Promise<Signal> => {
  
  try {
    // কী সিলেকশন লজিক: ১. ইউজার ইনপুট, ২. এনভায়রনমেন্ট ভেরিয়েবল, ৩. ডিফল্ট কি
    const finalKey = providedKey || import.meta.env.VITE_API_KEY || DEFAULT_API_KEY;

    if (!finalKey || finalKey.length < 10) {
      throw new Error("INVALID_KEY");
    }

    // SDK ইনিশিয়ালাইজেশন
    const genAI = new GoogleGenerativeAI(finalKey);
    
    // ডেটা প্রসেসিং (লাস্ট ৫০ ক্যান্ডেল নিলে বিশ্লেষণ ভালো হয়)
    const recentCandles = candles.slice(-50);
    const candleDataStr = recentCandles.map((c) => {
      return `${c.close > c.open ? 'G' : 'R'}:${c.close.toFixed(5)}`;
    }).join('|');

    const technicalContext = `
      MARKET: ${assetName}, TREND: ${indicators?.trend || 'N/A'}, PATTERN: ${indicators?.detectedPattern || 'N/A'}
      EMA8: ${indicators?.ema8?.toFixed(5)}, EMA21: ${indicators?.ema21?.toFixed(5)}
      RSI: ${indicators?.rsi?.toFixed(2)}, ATR: ${indicators?.atr?.toFixed(5)}
      FIB: ${indicators?.fib618?.toFixed(5)}
    `;

    const systemInstruction = `You are "SAKIB AI SIGNAL PRO". 
    Analyze the technical data and predict the NEXT 1-minute candle.
    RULES:
    - CALL: Strong buy
    - PUT: Strong sell
    - NEUTRAL: Unstable market
    - description: Give a detailed logic in Bengali (বাংলা).`;

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", 
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            type: { type: SchemaType.STRING, enum: ["CALL", "PUT", "NEUTRAL"] },
            pattern: { type: SchemaType.STRING },
            confidence: { type: SchemaType.NUMBER },
            description: { type: SchemaType.STRING }
          },
          required: ["type", "pattern", "confidence", "description"]
        }
      },
      systemInstruction: systemInstruction,
    });

    const result = await model.generateContent(
      `Context: ${technicalContext}. Candles: ${candleDataStr}. Output JSON.`
    );

    const data = JSON.parse(result.response.text());

    return {
      id: 'ss-' + Date.now(),
      type: data.type || 'NEUTRAL',
      pattern: data.pattern || 'Market Analysis',
      category: 'SAKIB AI Sure Shot',
      confidence: data.confidence || 90,
      description: data.description || 'মার্কেট ট্রেন্ড অনুযায়ী পরবর্তী মুভমেন্ট ফলো করুন।',
      time: Date.now(),
      expiresAt: Date.now() + EXPIRY_DURATION_MS
    };

  } catch (error: any) {
    console.error("AI Error:", error);
    return {
      id: 'err-' + Date.now(),
      type: 'NEUTRAL',
      pattern: 'Waiting...',
      category: 'System Error',
      confidence: 0,
      time: Date.now(),
      expiresAt: Date.now() + 10000,
      description: 'সার্ভার রেসপন্স করছে না। আপনার Gemini API Key টি চেক করুন অথবা কিছুক্ষণ পর চেষ্টা করুন।'
    };
  }
};
