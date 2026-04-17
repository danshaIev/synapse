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
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.length === 0) return true;
      if (trimmed.startsWith("#")) return true;
      if (trimmed.startsWith("-")) return true;
      const stopwordRatio = countStopwords(trimmed) / wordCount(trimmed);
      return stopwordRatio < 0.6;
    });
    if (filtered.length / lines.length <= targetRatio) return filtered.join("\n");
    return filtered.join("\n");
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
