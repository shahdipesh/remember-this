import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";

export const SYSTEM_PROMPT =
  "You are a helpful personal assistant chatting with your owner.";

export type HistoryItem = { role: string; text: string };

type Model = ChatGoogleGenerativeAI | ChatGroq | ChatOpenAI;

/**
 * Pick the LLM from env. OpenRouter wins when several keys are set.
 * Returns null when no key is configured (caller streams an error reply).
 */
export function getModel(): Model | null {
  if (process.env.OPENROUTER_API_KEY) {
    return new ChatOpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-latest",
    });
  }
  if (process.env.GEMINI_API_KEY) {
    return new ChatGoogleGenerativeAI({
      apiKey: process.env.GEMINI_API_KEY,
      model: "gemini-2.0-flash",
    });
  }
  if (process.env.GROQ_API_KEY) {
    return new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
    });
  }
  return null;
}

export function buildMessages(history: HistoryItem[], userText: string) {
  const msgs = [new SystemMessage(SYSTEM_PROMPT)];
  for (const h of history) {
    msgs.push(h.role === "user" ? new HumanMessage(h.text) : new AIMessage(h.text));
  }
  msgs.push(new HumanMessage(userText));
  return msgs;
}
