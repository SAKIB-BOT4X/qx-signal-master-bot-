import { Strategy } from '../types';

export const INITIAL_CANDLES_COUNT = 100; 
export const MAX_CANDLES_DISPLAY = 150;  
export const UPDATE_INTERVAL_MS = 1000;
export const EXPIRY_DURATION_MS = 60000; // 1 minute (Standard Binary Expiry)

export const SURE_SHOT_STRATEGIES: Strategy[] = [
  {
    id: 'magic-hacker',
    name: 'ম্যাজিক হ্যাকার মোড',
    description: 'এআই সরাসরি ক্যান্ডেল সাইকোলজি হ্যাক করে পরবর্তী ডিরেকশন প্রেডিক্ট করে।',
    winRate: '১০০%',
    riskLevel: 'Low'
  },
  {
    id: 'v-pattern',
    name: 'V-প্যাটার্ন শিওর শট',
    description: 'মার্কেট দ্রুত ড্রপ করার পর যখন রিকভারি শুরু করে, তখন এই প্যাটার্নটি কাজ করে।',
    winRate: '৯৯%',
    riskLevel: 'Low'
  },
  {
    id: 'rejection-master',
    name: 'রিজেকশন মাস্টার',
    description: 'স্ট্রং সাপোর্ট/রেজিস্ট্যান্স থেকে ক্যান্ডেল রিজেকশন ডিটেকশন।',
    winRate: '৯৮%',
    riskLevel: 'Low'
  },
  {
    id: 'trend-killer',
    name: 'ট্রেন্ড কিলার প্রিমিয়াম',
    description: 'শক্তিশালী ট্রেন্ডের সাথে মোমেন্টাম ট্রেডিং সিগন্যাল।',
    winRate: '৯৯%',
    riskLevel: 'Low'
  }
];