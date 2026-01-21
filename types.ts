export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type SignalType = 'CALL' | 'PUT' | 'NEUTRAL';

export interface Signal {
  id: string;
  type: SignalType;
  pattern: string;
  category: string;
  confidence: number;
  time: number;
  description: string;
  voted?: boolean;
  result?: 'TRUE' | 'FALSE';
  expiresAt: number;
}

export interface Stats {
  totalSignals: number;
  correctSignals: number;
  incorrectSignals: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  winRate: string;
  riskLevel: string;
}