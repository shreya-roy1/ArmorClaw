import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  // Enable CORS for all routes - required for deployment
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-user-id", "Authorization"],
  }));

  app.use(express.json());

  // Logging middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // --- Financial System Logic ---
  
  // User Data Store
  interface UserData {
    wallet: number;
    portfolio: { [key: string]: { quantity: number, avgPrice: number } };
    logs: any[];
    researchLogs: any[];
    portfolioHistory: { time: string, value: number }[];
    simulationMode: boolean;
  }

  const usersData = new Map<string, UserData>();

  function getOrCreateUserData(uid: string): UserData {
    if (!uid) {
      // Fallback for unauthenticated or legacy calls
      uid = "default_admin";
    }
    if (!usersData.has(uid)) {
      usersData.set(uid, {
        wallet: 128450.00,
        portfolio: {
          "AAPL": { quantity: 35, avgPrice: 150.20 },
          "MSFT": { quantity: 25, avgPrice: 380.50 },
          "TSLA": { quantity: 20, avgPrice: 210.00 },
          "GOOGL": { quantity: 15, avgPrice: 130.40 },
          "NVDA": { quantity: 5, avgPrice: 750.00 }
        },
        logs: [],
        researchLogs: [],
        portfolioHistory: [],
        simulationMode: true
      });
      
      // Initialize history
      const data = usersData.get(uid)!;
      const now = new Date();
      for (let i = 10; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        data.portfolioHistory.push({ time, value: data.wallet + (Math.random() - 0.5) * 5000 });
      }
    }
    return usersData.get(uid)!;
  }

  // Intent Model
  interface Intent {
    action: "BUY" | "SELL" | "ANALYZE" | "EXTERNAL_CALL";
    asset?: string;
    quantity?: number;
    price?: number;
    price_limit?: number;
    source_agent: string;
    risk_approved: boolean;
    tool?: string;
  }

  // Policy Model
  const policy = {
    max_trade_value: 1000000, // Adjusted for INR
    max_quantity: 100,
    allowed_assets: ["AAPL", "MSFT", "GOOGL", "TSLA", "NVDA"],
    agent_permissions: {
      research_agent: ["ANALYZE"],
      risk_agent: ["VALIDATE"],
      execution_agent: ["EXECUTE"],
    },
    execution_requires: ["risk_approved"],
    restricted_actions: {
      execution_agent: ["EXTERNAL_CALL"],
    },
  };

  // Helper to add logs to specific user
  function addLog(uid: string, agent: string, intent: Intent, decision: "ALLOW" | "BLOCK", reason: string, rule: string = "Policy Validated") {
    const data = getOrCreateUserData(uid);
    const logEntry = {
      agent,
      intent,
      decision,
      reason,
      policy_rule_triggered: rule,
      timestamp: new Date().toISOString(),
    };
    data.logs.push(logEntry);
    if (data.logs.length > 100) data.logs.shift();
    console.log(`[${decision}] ${agent} (${uid}): ${reason}`);
    return logEntry;
  }

  function addResearchLog(uid: string, message: string, asset?: string) {
    const data = getOrCreateUserData(uid);
    const log = {
      timestamp: new Date().toISOString(),
      message,
      asset
    };
    data.researchLogs.push(log);
    if (data.researchLogs.length > 50) data.researchLogs.shift();
    return log;
  }

  function updatePortfolioHistory(uid: string) {
    const data = getOrCreateUserData(uid);
    const assetsValue = Object.entries(data.portfolio).reduce((acc, [name, pData]) => {
      return acc + (pData.quantity * (prices[name] || 0));
    }, 0);
    const totalValue = data.wallet + assetsValue;
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    data.portfolioHistory.push({ time: now, value: totalValue });
    if (data.portfolioHistory.length > 20) data.portfolioHistory.shift();
  }

  // Update history for all users periodically
  setInterval(() => {
    for (const uid of usersData.keys()) {
      updatePortfolioHistory(uid);
    }
  }, 60000);

  // Simulated Live Prices (in INR - roughly 83x USD)
  let prices: { [key: string]: number } = {
    "AAPL": 14500.50,
    "MSFT": 34000.20,
    "TSLA": 15000.10,
    "GOOGL": 12000.30,
    "NVDA": 73000.40
  };

  // Historical data for charts
  let historicalData: { [key: string]: any[] } = {};
  const assets = ["AAPL", "MSFT", "GOOGL", "TSLA", "NVDA"];
  
  function generateHistoricalData(symbol: string) {
    const data = [];
    let currentPrice = prices[symbol];
    const now = new Date();
    for (let i = 50; i >= 0; i--) {
      const time = new Date(now.getTime() - i * 3600000);
      const open = currentPrice + (Math.random() - 0.5) * 5;
      const close = open + (Math.random() - 0.5) * 5;
      const high = Math.max(open, close) + Math.random() * 2;
      const low = Math.min(open, close) - Math.random() * 2;
      data.push({
        time: time.toISOString(),
        open: parseFloat(open.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        volume: Math.floor(Math.random() * 10000)
      });
      currentPrice = close;
    }
    return data;
  }

  assets.forEach(asset => {
    historicalData[asset] = generateHistoricalData(asset);
  });

  // Update prices periodically
  setInterval(() => {
    Object.keys(prices).forEach(symbol => {
      const change = (Math.random() - 0.5) * 2; // -1 to +1
      prices[symbol] = parseFloat((prices[symbol] + change).toFixed(2));
      
      // Update historical data
      const last = historicalData[symbol][historicalData[symbol].length - 1];
      const now = new Date();
      if (new Date(last.time).getHours() !== now.getHours()) {
        historicalData[symbol].push({
          time: now.toISOString(),
          open: last.close,
          close: prices[symbol],
          high: Math.max(last.close, prices[symbol]) + Math.random(),
          low: Math.min(last.close, prices[symbol]) - Math.random(),
          volume: Math.floor(Math.random() * 10000)
        });
        if (historicalData[symbol].length > 100) historicalData[symbol].shift();
      } else {
        last.close = prices[symbol];
        last.high = Math.max(last.high, prices[symbol]);
        last.low = Math.min(last.low, prices[symbol]);
      }
    });
  }, 5000);

  // ArmorClaw Enforcement Layer
  class ArmorClaw {
    static validate(intent: Intent): { allowed: boolean; reason: string; rule?: string } {
      const { source_agent, action, asset, quantity, risk_approved } = intent;

      // 1. Verify Agent Permissions
      const allowedActions = (policy.agent_permissions as any)[source_agent] || [];
      
      // Special case: Execution agent can only EXECUTE if it's a BUY/SELL
      if (source_agent === "execution_agent" && (action === "BUY" || action === "SELL")) {
        if (!allowedActions.includes("EXECUTE")) {
           return { allowed: false, reason: `Agent ${source_agent} does not have EXECUTE permission`, rule: "agent_permissions" };
        }
      } else if (!allowedActions.includes(action)) {
        return { allowed: false, reason: `Agent ${source_agent} attempted unauthorized action: ${action}`, rule: "agent_permissions" };
      }

      // 2. Restricted Actions Check
      const restricted = (policy.restricted_actions as any)[source_agent] || [];
      if (restricted.includes(action)) {
        return { allowed: false, reason: `Action ${action} is strictly restricted for ${source_agent}`, rule: "restricted_actions" };
      }

      // 3. Trade Specific Policies
      if (action === "BUY" || action === "SELL") {
        // Asset check
        if (asset && !policy.allowed_assets.includes(asset)) {
          return { allowed: false, reason: `Asset ${asset} is not in the allowed universe`, rule: "allowed_assets" };
        }

        // Quantity check
        if (quantity && quantity > policy.max_quantity) {
          return { allowed: false, reason: `Quantity ${quantity} exceeds maximum allowed (${policy.max_quantity})`, rule: "max_quantity" };
        }

        // Risk approval check
        if (policy.execution_requires.includes("risk_approved") && !risk_approved) {
          return { allowed: false, reason: "Execution requires risk_approved flag", rule: "execution_requires" };
        }
      }

      return { allowed: true, reason: "Intent validated against policy" };
    }
  }

  // Alpaca Integration
  async function executeAlpacaTrade(uid: string, intent: Intent) {
    const data = getOrCreateUserData(uid);
    const simulationMode = data.simulationMode;
    const apiKey = process.env.ALPACA_API_KEY_ID?.trim();
    const secretKey = process.env.ALPACA_API_SECRET_KEY?.trim();
    const baseUrl = process.env.ALPACA_PAPER_URL || "https://paper-api.alpaca.markets";
    const isMockMode = simulationMode || !apiKey || !secretKey || apiKey === "your_api_key_id" || secretKey === "your_api_secret_key";

    console.log(`[Alpaca] Attempting trade for ${intent.asset}. Mode: ${isMockMode ? "DEMO/MOCK" : "LIVE/PAPER"}`);

    if (isMockMode) {
      console.warn("Alpaca API keys are missing or invalid. Falling back to Demo Mode for prototype demonstration.");
      // Simulate a successful Alpaca response for demo purposes
      return {
        id: `demo-order-${Math.random().toString(36).substr(2, 9)}`,
        client_order_id: `demo-client-${Date.now()}`,
        created_at: new Date().toISOString(),
        status: "accepted",
        symbol: intent.asset,
        qty: intent.quantity?.toString(),
        side: intent.action.toLowerCase(),
        type: "market",
        time_in_force: "gtc",
      };
    }

    try {
      const response = await fetch(`${baseUrl}/v2/orders`, {
        method: "POST",
        headers: {
          "APCA-API-KEY-ID": apiKey,
          "APCA-API-SECRET-KEY": secretKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          symbol: intent.asset,
          qty: intent.quantity?.toString(),
          side: intent.action.toLowerCase(),
          type: "market",
          time_in_force: "gtc",
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (response.status === 401) {
          console.error("Alpaca Authentication Failed: The provided API keys were rejected.");
          throw new Error("Alpaca Authentication Failed: Please verify your API Key ID and Secret Key in the Secrets panel.");
        }
        throw new Error(`Alpaca API Error (${response.status}): ${JSON.stringify(error)}`);
      }

      return await response.json();
    } catch (err: any) {
      console.error("Alpaca Execution Error:", err.message);
      throw err;
    }
  }

  // API Endpoints
  const apiRouter = express.Router();

  apiRouter.get("/config-status", (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    const apiKey = process.env.ALPACA_API_KEY_ID;
    const isConfigured = !!apiKey && apiKey !== "your_api_key_id";
    res.json({ isConfigured, simulationMode: data.simulationMode });
  });

  apiRouter.post("/toggle-simulation", (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    data.simulationMode = !data.simulationMode;
    console.log(`User ${uid} Simulation Mode: ${data.simulationMode}`);
    res.json({ simulationMode: data.simulationMode });
  });

  apiRouter.get("/logs", (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    res.json(data.logs);
  });

  apiRouter.get("/research-logs", (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    res.json(data.researchLogs);
  });

  apiRouter.get("/historical-data/:symbol", (req, res) => {
    const { symbol } = req.params;
    const { timeframe = '1H' } = req.query;
    
    // Generate data based on timeframe
    const data = [];
    let currentPrice = prices[symbol] || 100;
    const now = new Date();
    
    let points = 50;
    let interval = 3600000; // 1 hour
    
    if (timeframe === '1D') {
      points = 24;
      interval = 3600000; // 1 hour
    } else if (timeframe === '1W') {
      points = 7;
      interval = 86400000; // 1 day
    } else if (timeframe === '1M') {
      points = 30;
      interval = 86400000; // 1 day
    } else if (timeframe === '1H') {
      points = 60;
      interval = 60000; // 1 minute
    }

    for (let i = points; i >= 0; i--) {
      const time = new Date(now.getTime() - i * interval);
      const open = currentPrice + (Math.random() - 0.5) * (currentPrice * 0.02);
      const close = open + (Math.random() - 0.5) * (currentPrice * 0.01);
      const high = Math.max(open, close) + Math.random() * (currentPrice * 0.005);
      const low = Math.min(open, close) - Math.random() * (currentPrice * 0.005);
      data.push({
        time: time.toISOString(),
        open: parseFloat(open.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        volume: Math.floor(Math.random() * 10000)
      });
      currentPrice = close;
    }
    
    res.json(data);
  });

  apiRouter.get("/portfolio", (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    res.json({ portfolio: data.portfolio, wallet: data.wallet });
  });

  apiRouter.get("/portfolio-history", (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    res.json(data.portfolioHistory);
  });

  apiRouter.get("/prices", (req, res) => {
    res.json(prices);
  });

  apiRouter.post("/clear-logs", (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    data.logs = [];
    data.researchLogs = [];
    res.json({ success: true });
  });

  apiRouter.post("/wallet/deposit", (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    const { amount } = req.body;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return res.status(400).json({ error: "Invalid amount" });
    data.wallet += val;
    addLog(uid, "system", { action: "EXTERNAL_CALL", source_agent: "system", risk_approved: true } as any, "ALLOW", `Deposited ₹${val.toLocaleString()} to wallet.`);
    res.json({ success: true, wallet: data.wallet });
  });

  apiRouter.post("/wallet/withdraw", (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    const { amount } = req.body;
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) return res.status(400).json({ error: "Invalid amount" });
    if (data.wallet < val) return res.status(400).json({ error: "Insufficient funds" });
    data.wallet -= val;
    addLog(uid, "system", { action: "EXTERNAL_CALL", source_agent: "system", risk_approved: true } as any, "ALLOW", `Withdrew ₹${val.toLocaleString()} from wallet.`);
    res.json({ success: true, wallet: data.wallet });
  });

  apiRouter.post("/trade", async (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const data = getOrCreateUserData(uid);
    const { asset, quantity, action } = req.body;
    const qty = parseFloat(quantity);
    const price = prices[asset] || 10000;
    const totalValue = qty * price;

    const intent: Intent = {
      action: action || "BUY",
      asset,
      quantity: qty,
      price: price,
      source_agent: "execution_agent",
      risk_approved: true,
    };

    const validation = ArmorClaw.validate(intent);
    if (validation.allowed) {
      // Additional Financial Checks
      if (action === "BUY") {
        if (data.wallet < totalValue) {
          const reason = `Insufficient funds. Required: ₹${totalValue.toLocaleString()}, Available: ₹${data.wallet.toLocaleString()}`;
          addLog(uid, "execution_agent", intent, "BLOCK", reason, "insufficient_funds");
          return res.json({ success: false, decision: "BLOCK", reason });
        }
        data.wallet -= totalValue;
        const current = data.portfolio[asset] || { quantity: 0, avgPrice: 0 };
        const newQty = current.quantity + qty;
        const newAvgPrice = ((current.quantity * current.avgPrice) + totalValue) / newQty;
        data.portfolio[asset] = { quantity: newQty, avgPrice: newAvgPrice };
      } else if (action === "SELL") {
        const current = data.portfolio[asset] || { quantity: 0, avgPrice: 0 };
        if (current.quantity < qty) {
          const reason = `Insufficient asset quantity. Required: ${qty}, Available: ${current.quantity}`;
          addLog(uid, "execution_agent", intent, "BLOCK", reason, "insufficient_assets");
          return res.json({ success: false, decision: "BLOCK", reason });
        }
        
        const profit = (price - current.avgPrice) * qty;
        data.wallet += totalValue;
        data.portfolio[asset].quantity -= qty;
        
        addResearchLog(uid, `Trade executed: Sold ${qty} ${asset} at ₹${price.toLocaleString()}. Profit/Loss: ₹${profit.toLocaleString()}`, asset);
      }

      addLog(uid, "execution_agent", intent, "ALLOW", validation.reason);
      res.json({ success: true, decision: "ALLOW", wallet: data.wallet, portfolio: data.portfolio });
    } else {
      addLog(uid, "execution_agent", intent, "BLOCK", validation.reason, validation.rule);
      res.json({ success: false, decision: "BLOCK", reason: validation.reason });
    }
  });

  apiRouter.post("/run-scenario", async (req, res) => {
    const uid = req.headers["x-user-id"] as string;
    const { scenarioId } = req.body;
    console.log(`Running scenario ${scenarioId} for user ${uid}`);
    let result: any = { status: "started" };

    try {
      switch (scenarioId) {
        case 1: // Allowed Trade
          {
            const intent: Intent = {
              action: "BUY",
              asset: "AAPL",
              quantity: 5,
              source_agent: "execution_agent",
              risk_approved: true,
            };
            const validation = ArmorClaw.validate(intent);
            if (validation.allowed) {
              addLog(uid, "execution_agent", intent, "ALLOW", validation.reason);
              const trade = await executeAlpacaTrade(uid, intent);
              result = { status: "success", trade };
            } else {
              addLog(uid, "execution_agent", intent, "BLOCK", validation.reason, validation.rule);
              result = { status: "blocked", reason: validation.reason };
            }
          }
          break;

        case 2: // Blocked Delegation Violation (Research agent attempts to execute)
          {
            const intent: Intent = {
              action: "BUY",
              asset: "AAPL",
              quantity: 1,
              source_agent: "research_agent",
              risk_approved: false,
            };
            const validation = ArmorClaw.validate(intent);
            if (validation.allowed) {
              addLog(uid, "research_agent", intent, "ALLOW", validation.reason);
              result = { status: "success" };
            } else {
              addLog(uid, "research_agent", intent, "BLOCK", validation.reason, validation.rule);
              result = { status: "blocked", reason: validation.reason };
            }
          }
          break;

        case 3: // Blocked Policy Violation (Exceeding max quantity)
          {
            const intent: Intent = {
              action: "BUY",
              asset: "AAPL",
              quantity: 500,
              source_agent: "execution_agent",
              risk_approved: true,
            };
            const validation = ArmorClaw.validate(intent);
            if (validation.allowed) {
              addLog(uid, "execution_agent", intent, "ALLOW", validation.reason);
              result = { status: "success" };
            } else {
              addLog(uid, "execution_agent", intent, "BLOCK", validation.reason, validation.rule);
              result = { status: "blocked", reason: validation.reason };
            }
          }
          break;

        case 4: // Blocked Data Access Violation (Execution agent attempts external call)
          {
            const intent: Intent = {
              action: "EXTERNAL_CALL",
              source_agent: "execution_agent",
              risk_approved: false,
              tool: "fetch_external_secrets",
            };
            const validation = ArmorClaw.validate(intent);
            if (validation.allowed) {
              addLog(uid, "execution_agent", intent, "ALLOW", validation.reason);
              result = { status: "success" };
            } else {
              addLog(uid, "execution_agent", intent, "BLOCK", validation.reason, validation.rule);
              result = { status: "blocked", reason: validation.reason };
            }
          }
          break;

        default:
          res.status(400).json({ error: "Unknown scenario" });
          return;
      }
      res.json(result);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message });
    }
  });

  app.use("/api", apiRouter);

  // Fallback for unknown API routes to prevent HTML response
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: "API route not found" });
  });

  // Vite middleware for development
  const isProduction = process.env.NODE_ENV === "production" || process.env.NODE_ENV === "prod";
  
  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve("dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
