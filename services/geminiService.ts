import { GoogleGenerativeAI } from "@google/generative-ai";
import { Candle, Signal } from "../types";
import { EXPIRY_DURATION_MS } from "../components/constants";

// আপনার দেওয়া নতুন এপিআই কি
const API_KEY = "AIzaSyCjYEsrNHyoIqKekROjVE8Grzix8m5jJ1o";

export const analyzeMarket = async (
  candles: Candle[], 
  assetName: string, 
  indicators: any
): Promise<Signal> => {
  
  // Google GenAI Initialize
  const genAI = new GoogleGenerativeAI(API_KEY);
  
  const recentCandles = candles.slice(-30);
  const candleDataStr = recentCandles.map((c) => {
    return `${c.close > c.open ? 'G' : 'R'}:${c.close.toFixed(5)}`;
  }).join('|');

  // ১০০+ ইন্ডিকেটর ডেটা যা এআই বিশ্লেষণ করবে
  const technicalContext = `
    MARKET: ${assetName}, TREND: ${indicators.trend || 'N/A'}, PATTERN: ${indicators.detectedPattern || 'Scanning'}
    MMTUM: ${indicators.momentum?.toFixed(5) || 0}, ATR: ${indicators.atr?.toFixed(5) || 0}, ADX_PWR: ${indicators.trendStrength?.toFixed(2) || 0}
    MA CLUSTER: EMA8(${indicators.ema8?.toFixed(5)}), EMA21(${indicators.ema21?.toFixed(5)}), EMA50(${indicators.ema50?.toFixed(5)}), EMA200(${indicators.ema200?.toFixed(5)})
    MACD: Hist(${indicators.macdH?.toFixed(6) || 0})
    RSI: ${indicators.rsi?.toFixed(2) || 50}, W%R: ${indicators.williamsR?.toFixed(2) || -50}
    FIBONACCI: 0.618(${indicators.fib618?.toFixed(5) || 'N/A'})
    S/R LEVELS: R1(${indicators.pivotR1?.toFixed(5)}), S1(${indicators.pivotS1?.toFixed(5)})
    PSYCHOLOGY: BullPower(${indicators.bullPower?.toFixed(5)}), VolTrend(${indicators.volTrend})
  `;

  const systemInstruction = `You are "Quotex Sure Shot AI v20 Platinum Pro" specialized for "SAKIB AI SIGNAL" app. 
  Your task: Analyze technical data, Fibonacci levels, and Chart Patterns to predict the EXACT direction of the NEXT 1-minute candle.
  
  ULTRA ANALYSIS LOGIC:
  1. Fibonacci Rejection: Check price action at Fib 0.618 levels.
  2. Pattern Breakout: Confirm if Triangle/Channel/Support is breaking.
  3. Signal Strength: Only give CALL/PUT if confidence is above 90%.
  4. Volume Confirmation: Ensure volume trend matches prediction.
  
  OUTPUT RULES:
  - CALL: Strong bullish signals.
  - PUT: Strong bearish signals.
  - NEUTRAL: If data is conflicting.
  - JSON output ONLY. The "description" must be in Bengali (বাংলা) detailing the technical reason for the trade.`;

  try {
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash", // Using stable flash for consistency
    });

    const prompt = `Indicators & Patterns: ${technicalContext}. Recent Price Action: ${candleDataStr}. Predict next candle direction for SAKIB AI SIGNAL!`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      },
      systemInstruction: systemInstruction
    });

    const responseText = result.response.text();
    const data = JSON.parse(responseText || '{}');

    return {
      id: 'ss-' + Date.now(),
      type: data.type || 'NEUTRAL',
      pattern: data.pattern || 'Technical Breakout',
      category: 'Sure Shot V20 Platinum',
      confidence: data.confidence || 95,
      description: data.description || 'মার্কেট ট্রেন্ড এবং ফিবোনাচি লেভেল অনুযায়ী পরবর্তী মুভমেন্ট ফলো করুন।',
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
      description: 'সার্ভার রেসপন্স করছে না বা এপিআই কি কাজ করছে না। আবার চেষ্টা করুন।'
    };
  }
};
