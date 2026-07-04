import { z } from "zod";
import { RISK_ANALYSIS_SYSTEM_PROMPT, buildUserPrompt } from "@/lib/ai/prompts";

export const riskAnalysisSchema = z.object({
  risk_level: z.enum(["low", "medium", "high", "critical"]),
  risk_score: z.number().int().min(0).max(100),
  category: z.enum([
    "fake_recruitment",
    "scholarship_scam",
    "mobile_money_fraud",
    "phishing",
    "impersonation",
    "fake_government_notice",
    "leaked_document",
    "ai_manipulation",
    "other",
    "none",
  ]),
  language: z.enum(["en", "fr", "pidgin", "mixed", "unknown"]),
  reasons: z.array(z.string()).min(1).max(4),
  indicators: z.object({
    has_urgency_pressure: z.boolean(),
    requests_payment: z.boolean(),
    requests_personal_info: z.boolean(),
    impersonates_institution: z.string().nullable(),
    contains_suspicious_link: z.boolean(),
  }),
  recommended_action: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
});

export type RiskAnalysisResult = z.infer<typeof riskAnalysisSchema> & {
  needs_human_review: true;
  source: "ai" | "rule_based_fallback";
};

const AI_TIMEOUT_MS = 8_000;

/**
 * Runs AI risk analysis (SRS Section 8). Always returns a result — falls back
 * to a rule-based check on missing API key, timeout, HTTP error, or invalid
 * JSON (FR-025), so a submitter never sees a bare error instead of a result.
 * needs_human_review is always true regardless of AI confidence (FR-024).
 */
export async function analyzeContent(content: string): Promise<RiskAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return ruleBasedFallback(content);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.2,
        messages: [
          { role: "system", content: RISK_ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(content) },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return ruleBasedFallback(content);
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (typeof raw !== "string") {
      return ruleBasedFallback(content);
    }

    const parsed = riskAnalysisSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return ruleBasedFallback(content);
    }

    return { ...parsed.data, needs_human_review: true, source: "ai" };
  } catch {
    return ruleBasedFallback(content);
  } finally {
    clearTimeout(timeout);
  }
}

const URGENCY_WORDS = [
  "urgent",
  "immediately",
  "act now",
  "expires today",
  "last chance",
  "24 hours",
  "urgence",
  "immédiatement",
];
const PAYMENT_WORDS = [
  "send money",
  "processing fee",
  "mobile money",
  "momo",
  "orange money",
  "western union",
  "pay now",
  "frais",
  "paiement",
];
const PERSONAL_INFO_WORDS = [
  "password",
  "pin code",
  "otp",
  "national id",
  "cni",
  "bank details",
  "account number",
];
const LINK_PATTERN = /https?:\/\/\S+|www\.\S+/i;
const INSTITUTION_PATTERN =
  /(minpostel|ministry|ministère|government|gouvernement|police|gendarmerie|customs|douanes|waec|gce board)/i;

/**
 * Deterministic keyword/pattern fallback used when the AI provider is
 * unavailable. Always yields medium risk / low confidence per SRS 8.3,
 * so it reads as "we couldn't fully analyze this — a human will look at it"
 * rather than a false "all clear."
 */
export function ruleBasedFallback(content: string): RiskAnalysisResult {
  const lower = content.toLowerCase();
  const hasUrgency = URGENCY_WORDS.some((w) => lower.includes(w));
  const requestsPayment = PAYMENT_WORDS.some((w) => lower.includes(w));
  const requestsPersonalInfo = PERSONAL_INFO_WORDS.some((w) => lower.includes(w));
  const hasLink = LINK_PATTERN.test(content);
  const institutionMatch = content.match(INSTITUTION_PATTERN)?.[0] ?? null;

  const signalCount = [hasUrgency, requestsPayment, requestsPersonalInfo, hasLink].filter(
    Boolean
  ).length;

  const reasons: string[] = [];
  if (hasUrgency) reasons.push("Uses urgent, time-pressured language.");
  if (requestsPayment) reasons.push("Mentions a payment or mobile-money transfer.");
  if (requestsPersonalInfo) reasons.push("Asks for a password, PIN, or personal ID details.");
  if (hasLink) reasons.push("Contains a link that could not be independently checked yet.");
  if (reasons.length === 0) {
    reasons.push("No high-risk keywords detected, but this has not been reviewed by a person yet.");
  }

  return {
    risk_level: signalCount >= 2 ? "high" : signalCount === 1 ? "medium" : "low",
    risk_score: Math.min(40 + signalCount * 20, 90),
    category: requestsPayment ? "mobile_money_fraud" : hasLink ? "phishing" : "other",
    language: "unknown",
    reasons,
    indicators: {
      has_urgency_pressure: hasUrgency,
      requests_payment: requestsPayment,
      requests_personal_info: requestsPersonalInfo,
      impersonates_institution: institutionMatch,
      contains_suspicious_link: hasLink,
    },
    recommended_action:
      "Do not send money or share personal information until this has been verified.",
    confidence: "low",
    needs_human_review: true,
    source: "rule_based_fallback",
  };
}
