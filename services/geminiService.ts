import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Candle, Signal } from "../types";
import { EXPIRY_DURATION_MS } from "../components/constants";

// আপনার দেওয়া এপিআই কি সরাসরি এখানে বসানো হয়েছে
const API_KEY = "AIzaSyCjYEsrNHyoIqKekROjVE8Grzix8m5jJ1o";

export const analyzeMarket = async (
  candles: Candle[], 
  assetName: string, 
  indicators: any
): Promise<Signal> => {
  
  // SDK ইনিশিয়ালাইজেশন
  const genAI = new GoogleGenerativeAI(API_KEY);
  
  const recentCandles = candles.slice(-30);
  const candleDataStr = recentCandles.map((c) => {
    return `${c.close > c.open ? 'G' : 'R'}:${c.close.toFixed(5)}`;
  }).join('|');

  // টেকনিক্যাল ডেটা যা এআই বিশ্লেষণ করবে
  const technicalContext = `
    MARKET: ${assetName}, TREND: ${indicators.trend || 'N/A'}, PATTERN: ${indicators.detectedPattern || 'N/A'}
    MMTUM: ${indicators.momentum?.toFixed(5)}, ATR: ${indicators.atr?.toFixed(5)}, ADX_PWR: ${indicators.trendStrength?.toFixed(2)}
    MA CLUSTER: EMA8(${indicators.ema8?.toFixed(5)}), EMA21(${indicators.ema21?.toFixed(5)}), EMA50(${indicators.ema50?.toFixed(5)}), EMA200(${indicators.ema200?.toFixed(5)})
    MACD: Line(${indicators.macdLine?.toFixed(6)}), Hist(${indicators.macdHist?.toFixed(6)})
    OSCILLATORS: RSI(${indicators.rsi?.toFixed(2)}), StochK(${indicators.stochK?.toFixed(2)}), W%R(${indicators.williamsR?.toFixed(2)})
    FIBONACCI: 0.618(${indicators.fib618?.toFixed(5)}), 0.5(${indicators.fib50?.toFixed(5)})
    S/R LEVELS: R1(${indicators.pivotR1?.toFixed(5)}), S1(${indicators.pivotS1?.toFixed(5)})
    PSYCHOLOGY: VolDelta(${indicators.forceIndex})
  `;

  const systemInstruction = `You are "Quotex Sure Shot AI v20 Platinum Pro". 
  Your task: Analyze 100+ technical data points, Fibonacci levels, and Chart Patterns to predict the EXACT direction of the NEXT 1-minute candle.
  
  OUTPUT RULES:
  - CALL: Strong bullish signals.
  - PUT: Strong bearish signals.
  - NEUTRAL: If data is conflicting.
  - JSON output ONLY. The "description" must be in Bengali (বাংলা) with detailed technical logic.`;

  try {
    // মডেল কনফিগারেশন এবং রেসপন্স স্কিমা
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", // বর্তমানের সবচেয়ে ফাস্ট এবং স্টেবল মডেল
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
      `Indicators & Patterns: ${technicalContext}. Recent Price Action: ${candleDataStr}. Predict next candle accurately!`
    );

    const response = result.response;
    const data = JSON.parse(response.text());

    return {
      id: 'ss-' + Date.now(),
      type: data.type || 'NEUTRAL',
      pattern: data.pattern || 'Technical Analysis',
      category: 'SAKIB AI Sure Shot',
      confidence: data.confidence || 95,
      description: data.description || 'মার্কেট ট্রেন্ড অনুযায়ী পরবর্তী মুভমেন্ট ফলো করুন।',
      time: Date.now(),
      expiresAt: Date.now() + EXPIRY_DURATION_MS
    };

  } catch (error: any) {
    console.error("AI Error:", error);
    return {
      id: 'err-' + Date.now(),
      type: 'NEUTRAL',
      pattern: 'Wait...',
      category: 'System Error',
      confidence: 0,
      time: Date.now(),
      expiresAt: Date.now() + 10000,
      description: 'সার্ভার রেসপন্স করছে না। এপিআই কি অথবা নেটওয়ার্ক চেক করুন।'
    };
  }
};
