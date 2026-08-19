// app/api/tenders/generate-description/route.ts
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { query } from "@/lib/db";
import { getAnthropicClient } from "@/lib/anthropic";
import { checkRateLimit } from "@/lib/rate-limit";
import { generateLocalDescription } from "@/lib/description-generator";

const MAX_INPUT_LENGTH = 500;
const MAX_PAST_EXAMPLES = 8;
const CANDIDATE_POOL_SIZE = 60;
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
  "at", "by", "is", "are", "will", "be", "this", "that", "it", "as",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

interface PastExampleCandidate {
  tender_description: string;
  renovation_type_id: number;
}

// Ranks past descriptions so the ones fed to the model are the ones most
// like the current request — same renovation type first, then keyword
// overlap with the staff note, with recency as a light tiebreaker. This is
// what lets grounding quality improve as more real tenders accumulate:
// a bigger pool means better matches surface instead of just "whatever was
// created most recently."
function rankPastExamples(
  candidates: PastExampleCandidate[],
  input: string,
  tenderName: string | undefined,
  renovationTypeId: number | undefined
): string[] {
  const queryTokens = tokenize(`${input} ${tenderName || ""}`);
  const scored = candidates.map((c, idx) => {
    let score = 0;
    if (renovationTypeId != null && c.renovation_type_id === renovationTypeId) {
      score += 5;
    }
    const descTokens = tokenize(c.tender_description);
    for (const t of queryTokens) {
      if (descTokens.has(t)) score += 1;
    }
    // Light recency tiebreaker: candidates array is already ordered newest-first.
    score += Math.max(0, (candidates.length - idx) / candidates.length) * 0.5;
    return { description: c.tender_description, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_PAST_EXAMPLES).map((s) => s.description);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { success } = await checkRateLimit(`generate-description:${session.user.id}`);
  if (!success) {
    return NextResponse.json({ error: "Too many requests, please try again shortly" }, { status: 429 });
  }

  let body: { input?: string; tenderName?: string; renovationType?: string; renovationTypeId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = (body.input || "").trim();
  if (!input) {
    return NextResponse.json({ error: "Describe what the project needs first" }, { status: 400 });
  }
  if (input.length > MAX_INPUT_LENGTH) {
    return NextResponse.json({ error: `Keep the input under ${MAX_INPUT_LENGTH} characters` }, { status: 400 });
  }

  // Ground the generation in real past descriptions so new tenders stay
  // stylistically aligned with existing ones. This is retrieval-based
  // grounding, not model fine-tuning — as more tenders are created with
  // real descriptions, the candidate pool grows and rankPastExamples()
  // surfaces the ones most relevant to this request (same renovation type,
  // overlapping keywords) instead of just the most recent ones, so
  // generation quality keeps improving as usage accumulates.
  const pastRes = await query(
    `SELECT tender_description, renovation_type_id
     FROM tender
     WHERE tender_description IS NOT NULL
       AND length(trim(tender_description)) > 0
       AND is_deleted = false
     ORDER BY created_at DESC
     LIMIT $1`,
    [CANDIDATE_POOL_SIZE]
  );
  const candidates: PastExampleCandidate[] = pastRes.rows;
  const pastExamples: string[] = rankPastExamples(
    candidates,
    input,
    body.tenderName,
    body.renovationTypeId
  );

  let client;
  try {
    client = getAnthropicClient();
  } catch {
    client = null;
  }

  if (client) {
    const examplesBlock = pastExamples.length > 0
      ? `Here are examples of descriptions from this organization's past tenders. Match their tone, structure, and level of detail:\n\n${pastExamples
          .map((d, i) => `Example ${i + 1}:\n${d}`)
          .join("\n\n")}`
      : `No past tender descriptions exist yet, so follow general best practice for this organization's tenders: clear, factual, and scannable by a contractor deciding whether to bid.`;

    const systemPrompt = `You write tender (renovation contract) descriptions for a facilities management company that publishes tenders to contractors. Your job is to turn a short, informal note from staff into a clear, informative description a contractor can act on.

${examplesBlock}

Guidelines:
- Write only the description text — no headers, no preamble, no "Here is the description:".
- Cover, when the input implies them: scope/nature of the works, whether the site stays open or closes during works, timing constraints (e.g. night work only, number of days/phases), and any staging (what happens in which phase).
- Keep it factual and concise — a few sentences to a short paragraph. Do not pad with filler.
- Do not invent specifics the input didn't give you (exact dates, dollar amounts, addresses) — describe only what's implied.
- Plain text only, no markdown formatting.`;

    const contextLines = [
      body.tenderName ? `Tender name: ${body.tenderName}` : null,
      body.renovationType ? `Renovation type: ${body.renovationType}` : null,
    ].filter(Boolean);

    const userMessage = [...contextLines, `Staff note: ${input}`].join("\n");

    try {
      const response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 500,
        output_config: { effort: "low" },
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      if (response.stop_reason === "refusal") {
        return NextResponse.json({ error: "Could not generate a description for that input" }, { status: 422 });
      }

      const textBlock = response.content.find((b) => b.type === "text");
      const description = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

      if (description) {
        return NextResponse.json({ description, groundedInPastExamples: pastExamples.length > 0 });
      }
      // Fall through to the local generator if Anthropic returned nothing usable.
    } catch (error) {
      console.error("generate-description: Anthropic call failed, falling back to local generator:", error);
      // Fall through to the local generator below.
    }
  }

  // No API key configured, or the Anthropic call failed/returned nothing —
  // fall back to a local, rule-based generator so the feature still works.
  const description = generateLocalDescription(input, {
    tenderName: body.tenderName,
    renovationType: body.renovationType,
  });

  if (!description) {
    return NextResponse.json({ error: "No description was generated" }, { status: 500 });
  }

  return NextResponse.json({ description, groundedInPastExamples: false });
}
