require('dotenv').config();
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Enable CORS so the frontend can hit the API when opened via Live Server or file://
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ── Yahoo Finance dynamic import (ESM module) ──────────────────────
let yahooFinance;
async function initYahoo() {
  const mod = await import('yahoo-finance2');
  yahooFinance = mod.default;
}
initYahoo().catch(err => console.error('Yahoo Finance init error:', err));

// ── OpenAI / OpenRouter setup ─────────────────────────────────────
const isOpenRouter = (process.env.OPENAI_API_KEY || '').startsWith('sk-or-');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
  baseURL: isOpenRouter ? 'https://openrouter.ai/api/v1' : undefined,
  defaultHeaders: isOpenRouter ? {
    "HTTP-Referer": "http://localhost:3000", // Optional, for OpenRouter analytics
    "X-Title": "StockSheild",               // Optional, for OpenRouter analytics
  } : undefined,
});

// ── Helper: Fetch stock data ───────────────────────────────────────
async function fetchStockData(symbol) {
  if (!yahooFinance) throw new Error('Yahoo Finance not initialized yet');

  // Ensure Indian exchange suffix
  let sym = symbol.toUpperCase().trim();
  if (!sym.endsWith('.NS') && !sym.endsWith('.BO')) {
    sym += '.NS';
  }

  const [quote, history] = await Promise.all([
    yahooFinance.quote(sym),
    yahooFinance.historical(sym, {
      period1: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      period2: new Date(),
      interval: '1d',
    }),
  ]);

  // Compute analytics
  const prices = history.map(h => h.close).filter(Boolean);
  const volumes = history.map(h => h.volume).filter(Boolean);
  const avgVolume = volumes.length ? volumes.reduce((a, b) => a + b, 0) / volumes.length : 0;
  const recentVolume = volumes.slice(-5);
  const avgRecentVolume = recentVolume.length ? recentVolume.reduce((a, b) => a + b, 0) / recentVolume.length : 0;
  const volumeSpike = avgVolume > 0 ? ((avgRecentVolume - avgVolume) / avgVolume * 100).toFixed(1) : 0;

  const priceChange90d = prices.length >= 2
    ? ((prices[prices.length - 1] - prices[0]) / prices[0] * 100).toFixed(1)
    : 0;

  // Volatility (std dev of daily returns)
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  const meanReturn = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length
    : 0;
  const volatility = (Math.sqrt(variance) * 100).toFixed(2);

  return {
    symbol: sym,
    name: quote.shortName || quote.longName || sym,
    price: quote.regularMarketPrice,
    change: quote.regularMarketChangePercent?.toFixed(2),
    dayHigh: quote.regularMarketDayHigh,
    dayLow: quote.regularMarketDayLow,
    fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
    marketCap: quote.marketCap,
    peRatio: quote.trailingPE,
    avgVolume: Math.round(avgVolume),
    recentAvgVolume: Math.round(avgRecentVolume),
    volumeSpike: `${volumeSpike}%`,
    priceChange90d: `${priceChange90d}%`,
    volatility: `${volatility}%`,
    historicalPrices: prices.slice(-30),
    historicalVolumes: volumes.slice(-30),
  };
}

// ── POST /api/analyze ──────────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  try {
    const { symbol, tip } = req.body;

    if (!symbol && !tip) {
      return res.status(400).json({ error: 'Please provide a stock symbol or tip text.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in .env file.' });
    }

    let stockData = null;
    let stockDataText = 'No stock data available.';

    if (symbol) {
      try {
        stockData = await fetchStockData(symbol);
        stockDataText = `
STOCK DATA FOR ${stockData.name} (${stockData.symbol}):
- Current Price: ₹${stockData.price}
- Day Change: ${stockData.change}%
- Day Range: ₹${stockData.dayLow} - ₹${stockData.dayHigh}
- 52-Week Range: ₹${stockData.fiftyTwoWeekLow} - ₹${stockData.fiftyTwoWeekHigh}
- Market Cap: ₹${(stockData.marketCap / 10000000).toFixed(2)} Cr
- P/E Ratio: ${stockData.peRatio || 'N/A'}
- Avg Volume (90d): ${stockData.avgVolume?.toLocaleString()}
- Recent Avg Volume (5d): ${stockData.recentAvgVolume?.toLocaleString()}
- Volume Spike: ${stockData.volumeSpike}
- 90-Day Price Change: ${stockData.priceChange90d}
- Daily Volatility: ${stockData.volatility}
- Last 30 closing prices: [${stockData.historicalPrices?.join(', ')}]
`;
      } catch (err) {
        stockDataText = `Failed to fetch stock data for "${symbol}": ${err.message}. Analyze based on tip text only.`;
      }
    }

    const prompt = `You are StockSheild, an expert AI system that detects stock market manipulation in Indian markets (NSE/BSE). Analyze the following information and determine if there are signs of stock manipulation such as pump-and-dump schemes, circular trading, spoofing, front-running, insider trading, or social media manipulation.

${stockDataText}

${tip ? `SUSPICIOUS TIP / MESSAGE:\n"${tip}"` : 'No tip text provided.'}

Analyze this thoroughly and respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{
  "score": <number 0-100, where 0 = completely safe, 100 = definite manipulation>,
  "verdict": "<one of: SAFE | LOW RISK | MODERATE RISK | HIGH RISK | CRITICAL DANGER>",
  "redFlags": ["<flag 1>", "<flag 2>", ...],
  "analysis": "<detailed 2-3 paragraph analysis explaining your findings>",
  "recommendation": "<one line actionable recommendation for the investor>",
  "manipulationType": "<suspected type of manipulation or 'None detected'>"
}

Be thorough, objective, and consider:
- Unusual volume spikes vs historical averages
- Price volatility patterns
- Language used in tip (urgency, guaranteed returns, insider info claims)
- Market cap vs hype level
- P/E ratio anomalies
- Social media pump patterns
- Penny stock characteristics`;

    const response = await openai.chat.completions.create({
      model: isOpenRouter ? 'openai/gpt-3.5-turbo' : 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });
    const responseText = response.choices[0].message.content;

    // Search for JSON object in response text
    let analysis;
    try {
      const start = responseText.indexOf('{');
      const end = responseText.lastIndexOf('}');
      if (start === -1 || end === -1) throw new Error('No JSON found in response');

      const jsonStr = responseText.substring(start, end + 1);
      analysis = JSON.parse(jsonStr);
    } catch {
      analysis = {
        score: 50,
        verdict: 'UNABLE TO PARSE',
        redFlags: ['AI response could not be parsed'],
        analysis: responseText,
        recommendation: 'Please try again.',
        manipulationType: 'Unknown',
      };
    }

    res.json({
      success: true,
      stockData,
      analysis,
    });
  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: err.message || 'Analysis failed.' });
  }
});

// ── GET /api/quote/:symbol ─────────────────────────────────────────
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    let sym = req.params.symbol.toUpperCase().trim();
    if (!sym.endsWith('.NS') && !sym.endsWith('.BO')) sym += '.NS';
    const quote = await yahooFinance.quote(sym);
    res.json({
      symbol: sym,
      name: quote.shortName || quote.longName || sym,
      price: quote.regularMarketPrice,
      change: quote.regularMarketChangePercent?.toFixed(2),
    });
  } catch (err) {
    res.status(404).json({ error: `Stock "${req.params.symbol}" not found.` });
  }
});

// ── GET /api/alerts ────────────────────────────────────────────────
const ALERT_STOCKS = [
  { symbol: 'YESBANK.NS', name: 'Yes Bank', sector: 'Banking' },
  { symbol: 'SUZLON.NS', name: 'Suzlon Energy', sector: 'Energy' },
  { symbol: 'IRFC.NS', name: 'IRFC', sector: 'Finance' },
  { symbol: 'ZOMATO.NS', name: 'Zomato', sector: 'Tech' },
  { symbol: 'PAYTM.NS', name: 'Paytm', sector: 'Fintech' },
  { symbol: 'ADANIENT.NS', name: 'Adani Enterprises', sector: 'Conglomerate' },
  { symbol: 'IDEA.NS', name: 'Vodafone Idea', sector: 'Telecom' },
  { symbol: 'TATAMOTORS.NS', name: 'Tata Motors', sector: 'Auto' },
  { symbol: 'NHPC.NS', name: 'NHPC', sector: 'Power' },
  { symbol: 'PNB.NS', name: 'Punjab National Bank', sector: 'Banking' },
  { symbol: 'RPOWER.NS', name: 'Reliance Power', sector: 'Power' },
  { symbol: 'JPPOWER.NS', name: 'Jaiprakash Power', sector: 'Power' },
];

const ALERT_TYPES = [
  'Unusual volume detected',
  'Social media pump pattern',
  'Abnormal price spike',
  'Insider trading signals',
  'Circular trading suspected',
  'Penny stock alert',
  'Bulk deal flagged',
  'Operator activity detected',
  'Sudden promoter pledge change',
  'Unusual options activity',
];

app.get('/api/alerts', (req, res) => {
  const count = Math.floor(Math.random() * 3) + 3;
  const alerts = [];
  const usedStocks = new Set();

  for (let i = 0; i < count; i++) {
    let stock;
    do {
      stock = ALERT_STOCKS[Math.floor(Math.random() * ALERT_STOCKS.length)];
    } while (usedStocks.has(stock.symbol));
    usedStocks.add(stock.symbol);

    const alertType = ALERT_TYPES[Math.floor(Math.random() * ALERT_TYPES.length)];
    const score = Math.floor(Math.random() * 60) + 30;
    const minutesAgo = Math.floor(Math.random() * 60);

    alerts.push({
      id: Date.now() + i,
      symbol: stock.symbol.replace('.NS', ''),
      name: stock.name,
      sector: stock.sector,
      alertType,
      score,
      severity: score >= 70 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW',
      timestamp: new Date(Date.now() - minutesAgo * 60000).toISOString(),
      minutesAgo,
    });
  }

  alerts.sort((a, b) => a.minutesAgo - b.minutesAgo);
  res.json(alerts);
});

// ── Start server ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🛡️  StockSheild server running at http://localhost:3000`);
  console.log(`   OpenAI API: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Not configured — set OPENAI_API_KEY in .env'}\n`);
});
