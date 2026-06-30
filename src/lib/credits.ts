const CREDITS_KEY = "summar-credits";
const STARTING_CREDITS = 10.0; // EUR

interface CreditState {
  balance: number;
  history: CreditEntry[];
}

interface CreditEntry {
  id: string;
  amount: number;
  mode: string;
  subjectName: string;
  tokensIn: number;
  tokensOut: number;
  timestamp: number;
}

function getState(): CreditState {
  if (typeof window === "undefined") return { balance: STARTING_CREDITS, history: [] };
  try {
    const raw = localStorage.getItem(CREDITS_KEY);
    if (!raw) return { balance: STARTING_CREDITS, history: [] };
    return JSON.parse(raw);
  } catch {
    return { balance: STARTING_CREDITS, history: [] };
  }
}

function saveState(state: CreditState) {
  localStorage.setItem(CREDITS_KEY, JSON.stringify(state));
}

export function getBalance(): number {
  return getState().balance;
}

export function getHistory(): CreditEntry[] {
  return getState().history;
}

export function deductCredits(
  apiCostEur: number,
  mode: string,
  subjectName: string,
  tokensIn: number,
  tokensOut: number
): { charged: number; balance: number } {
  const charged = Math.round(apiCostEur * 2 * 10000) / 10000; // 2x markup
  const state = getState();
  state.balance = Math.round((state.balance - charged) * 10000) / 10000;
  state.history.unshift({
    id: crypto.randomUUID(),
    amount: charged,
    mode,
    subjectName,
    tokensIn,
    tokensOut,
    timestamp: Date.now(),
  });
  if (state.history.length > 50) state.history = state.history.slice(0, 50);
  saveState(state);
  return { charged, balance: state.balance };
}

export function resetCredits() {
  saveState({ balance: STARTING_CREDITS, history: [] });
}

// Gemini 2.0 Flash free tier pricing (per 1M tokens)
// Input: $0.10, Output: $0.40 — converted to EUR (~0.92 rate)
const INPUT_COST_PER_TOKEN = 0.10 / 1_000_000 * 0.92;
const OUTPUT_COST_PER_TOKEN = 0.40 / 1_000_000 * 0.92;

export function estimateApiCost(tokensIn: number, tokensOut: number): number {
  return tokensIn * INPUT_COST_PER_TOKEN + tokensOut * OUTPUT_COST_PER_TOKEN;
}
