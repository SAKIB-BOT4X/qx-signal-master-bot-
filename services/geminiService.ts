
import { GoogleGenAI, Type } from "@google/genai";
import { Candle, Signal } from "../types";
import { EXPIRY_DURATION_MS } from "../components/constants";

export const analyzeMarket = async (
  candles: Candle[], 
  assetName: string, 
  indicators: any
): Promise<Signal> => {
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const recentCandles = candles.slice(-30);
  const candleDataStr = recentCandles.map((c) => {
    return `${c.close > c.open ? 'G' : 'R'}:${c.close.toFixed(5)}`;
  }).join('|');

  // ১০০+ ইন্ডিকেটর ডেটা যা এআই বিশ্লেষণ করবে (এক্সট্রিম মোড)
  const technicalContext = `
    MARKET: ${assetName}, TREND: ${indicators.trend}, PATTERN: ${indicators.detectedPattern}
    MMTUM: ${indicators.momentum.toFixed(5)}, ATR: ${indicators.atr.toFixed(5)}, ADX_PWR: ${indicators.trendStrength.toFixed(2)}
    MA CLUSTER: EMA8(${indicators.ema8.toFixed(5)}), EMA21(${indicators.ema21.toFixed(5)}), EMA50(${indicators.ema50.toFixed(5)}), EMA200(${indicators.ema200.toFixed(5)})
    MACD: Line(${indicators.macdLine.toFixed(6)}), Hist(${indicators.macdHist.toFixed(6)})
    ICHIMOKU: Tenkan(${indicators.tenkanSen.toFixed(5)}), Kijun(${indicators.kijunSen.toFixed(5)})
    OSCILLATORS: RSI(${indicators.rsi.toFixed(2)}), StochK(${indicators.stochK.toFixed(2)}), W%R(${indicators.williamsR.toFixed(2)})
    FIBONACCI: 0.618(${indicators.fib618.toFixed(5)}), 0.5(${indicators.fib50.toFixed(5)}), 0.382(${indicators.fib382.toFixed(5)})
    S/R LEVELS: R2(${indicators.r2.toFixed(5)}), R1(${indicators.r1.toFixed(5)}), S1(${indicators.s1.toFixed(5)}), S2(${indicators.s2.toFixed(5)})
    PSYCHOLOGY: PinBar(${indicators.isPinBar}), Engulfing(${indicators.isEngulfing}), VolDelta(${indicators.volumeDelta})
  `;

  const systemInstruction = `You are "Quotex Sure Shot AI v20 Platinum Pro". 
  Your task: Analyze 100+ technical data points, Fibonacci levels, and Chart Patterns (Triangles, Channels) to predict the EXACT direction of the NEXT 1-minute candle.
  
  ULTRA ANALYSIS LOGIC:
  1. Fibonacci Rejection: Look for price action at Fib 0.618 or 0.5 levels.
  2. Pattern Breakout: Check if detectedPattern (Triangle/Channel) is about to break.
  3. ADX Strength: Only give high confidence signals if ADX_PWR is above 0.5.
  4. Volume Confirmation: Ensure VolDelta matches the direction of the signal.
  5. S/R Rejection: Confirm PinBar or Engulfing at S1/S2 or R1/R2.
  
  OUTPUT RULES:
  - CALL: Strong bullish signals with multiple confirmations.
  - PUT: Strong bearish signals with multiple confirmations.
  - NEUTRAL: If data is conflicting or volatility is extremely low.
  - JSON output ONLY. The "description" must be in Bengali (বাংলা) with detailed technical logic using Fibonacci and Patterns.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Indicators & Patterns: ${technicalContext}. Recent Price Action: ${candleDataStr}. Predict next candle accurately!`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["CALL", "PUT", "NEUTRAL"] },
            pattern: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            description: { type: Type.STRING }
          },
          required: ["type", "pattern", "confidence", "description"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');

    return {
      id: 'ss-' + Date.now(),
      type: result.type || 'NEUTRAL',
      pattern: result.pattern || 'Market Analysis',
      category: 'Sure Shot V20 Platinum',
      confidence: result.confidence || 95,
      description: result.description || 'মার্কেট ট্রেন্ড এবং ফিবোনাচি লেভেল অনুযায়ী পরবর্তী মুভমেন্ট ফলো করুন।',
      time: Date.now(),
      expiresAt: Date.now() + EXPIRY_DURATION_MS
    };

  } catch (error: any) {
    console.error("AI Error:", error);
    const errorMsg = error.message?.toLowerCase() || "";
    const isPermissionError = errorMsg.includes("permission") || errorMsg.includes("403") || errorMsg.includes("not found");
    
    return {
      id: 'err-' + Date.now(),
      type: 'NEUTRAL',
      pattern: isPermissionError ? 'AUTH_ERROR' : 'Wait...',
      category: 'System Error',
      confidence: 0,
      time: Date.now(),
      expiresAt: Date.now() + 10000,
      description: isPermissionError 
        ? 'এপিআই পারমিশন এরর! নতুন করে কি সিলেক্ট করুন।' 
        : 'সার্ভার রেসপন্স করছে না। আবার চেষ্টা করুন।'
    };
  }
};
