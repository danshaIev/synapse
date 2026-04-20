export interface Compressor {
  compress(text: string, targetRatio?: number): Promise<string>;
}

export class IdentityCompressor implements Compressor {
  async compress(text: string): Promise<string> {
    return text;
  }
}

export class HeuristicCompressor implements Compressor {
  async compress(text: string, targetRatio = 0.5): Promise<string> {
    const lines = text.split("\n");
    const scored = lines.map((line) => {
      const trimmed = line.trim();
      let score = 0.5;
      if (trimmed.length === 0) score = 1;
      else if (trimmed.startsWith("#")) score = 1;
      else if (trimmed.startsWith("-")) score = 0.9;
      else {
        const ratio = countStopwords(trimmed) / wordCount(trimmed);
        score = 1 - ratio;
      }
      return { line, score };
    });
    const targetLines = Math.max(1, Math.ceil(lines.length * targetRatio));
    const keep = new Set(
      [...scored]
        .map((s, i) => ({ ...s, i }))
        .sort((a, b) => b.score - a.score)
        .slice(0, targetLines)
        .map((s) => s.i),
    );
    return scored
      .map((s, i) => (keep.has(i) ? s.line : null))
      .filter((s): s is string => s !== null)
      .join("\n");
  }
}

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "as", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "must", "this", "that", "these",
  "those", "i", "you", "he", "she", "it", "we", "they", "them", "their",
]);

function countStopwords(text: string): number {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => STOPWORDS.has(w)).length;
}

function wordCount(text: string): number {
  return Math.max(1, text.split(/\s+/).filter(Boolean).length);
}
