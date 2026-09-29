export interface ExtractedData {
  items: Record<string, unknown>[];
}

export function extractDataJson(text: string): ExtractedData;
