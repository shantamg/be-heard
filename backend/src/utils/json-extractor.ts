/**
 * JSON Extraction Utility
 *
 * Robust JSON extraction from LLM responses with multiple fallback strategies.
 * Based on production patterns from lovely backend.
 */

// ============================================================================
// Types
// ============================================================================

export interface ExtractJsonOptions {
  /** Whether to log parsing attempts for debugging */
  debug?: boolean;
}

// ============================================================================
// JSON Extraction
// ============================================================================

/**
 * Clean and parse JSON string, handling common LLM quirks.
 */
function parseCleanJson(jsonStr: string): unknown {
  // Replace undefined with null to make it valid JSON
  const cleanedJson = jsonStr
    .replace(/:\s*undefined\b/g, ': null')
    .replace(/,\s*}/g, '}')  // Remove trailing commas before }
    .replace(/,\s*]/g, ']'); // Remove trailing commas before ]
  return JSON.parse(cleanedJson);
}

/**
 * Extract JSON from an LLM response using multiple strategies.
 *
 * Tries in order:
 * 1. JSON code blocks (```json ... ```)
 * 2. Raw JSON object ({ ... })
 * 3. Raw JSON array ([ ... ])
 * 4. Full response as JSON
 *
 * @param response - The raw LLM response string
 * @param options - Extraction options
 * @returns Parsed JSON object or throws error
 */
export function extractJsonFromResponse(
  response: string,
  options: ExtractJsonOptions = {}
): unknown {
  const { debug = false } = options;

  if (debug) {
    console.log('[JSON Extractor] Raw response:', response);
  }

  // Strategy 1: Extract JSON from code blocks
  const jsonBlockMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonBlockMatch) {
    try {
      const result = parseCleanJson(jsonBlockMatch[1].trim());
      if (debug) console.log('[JSON Extractor] Extracted from code block');
      return result;
    } catch (e) {
      if (debug) console.log('[JSON Extractor] Code block parse failed:', e);
    }
  }

  // Strategy 2: Find JSON object in response
  const jsonObjectMatch = response.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const result = parseCleanJson(jsonObjectMatch[0]);
      if (debug) console.log('[JSON Extractor] Extracted raw JSON object');
      return result;
    } catch (e) {
      if (debug) console.log('[JSON Extractor] Object parse failed:', e);
    }
  }

  // Strategy 3: Find JSON array in response
  const jsonArrayMatch = response.match(/\[[\s\S]*\]/);
  if (jsonArrayMatch) {
    try {
      const result = parseCleanJson(jsonArrayMatch[0]);
      if (debug) console.log('[JSON Extractor] Extracted raw JSON array');
      return result;
    } catch (e) {
      if (debug) console.log('[JSON Extractor] Array parse failed:', e);
    }
  }

  // Strategy 4: Try parsing the full response after cleanup
  const cleanedContent = response
    .trim()
    .replace(/^```json/, '')
    .replace(/```$/, '')
    .trim();

  try {
    const result = parseCleanJson(cleanedContent);
    if (debug) console.log('[JSON Extractor] Parsed cleaned full response');
    return result;
  } catch (error) {
    if (debug) console.log('[JSON Extractor] Full response parse failed:', error);
  }

  throw new Error(`Failed to extract JSON from LLM response: ${response.substring(0, 200)}...`);
}

/**
 * Safely extract JSON with a fallback value.
 * Never throws - returns fallback on any error.
 */
export function extractJsonSafe<T>(
  response: string,
  fallback: T,
  options: ExtractJsonOptions = {}
): T {
  try {
    return extractJsonFromResponse(response, options) as T;
  } catch (error) {
    console.warn('[JSON Extractor] Using fallback:', error);
    return fallback;
  }
}

// ============================================================================
// Typed Extraction Helpers
// ============================================================================

export interface InvitationResponse {
  response: string;
  invitationMessage: string | null;
}

/**
 * Extract and validate invitation phase response.
 */
export function extractInvitationResponse(
  rawResponse: string,
  debug = false
): InvitationResponse {
  const fallback: InvitationResponse = {
    response: rawResponse,
    invitationMessage: null,
  };

  try {
    const parsed = extractJsonFromResponse(rawResponse, { debug });

    if (typeof parsed !== 'object' || parsed === null) {
      console.warn('[JSON Extractor] Invitation response not an object');
      return fallback;
    }

    const obj = parsed as Record<string, unknown>;

    // Validate and extract response field
    const response = typeof obj.response === 'string' ? obj.response : rawResponse;

    // Validate and extract invitationMessage field
    let invitationMessage: string | null = null;
    if (typeof obj.invitationMessage === 'string' && obj.invitationMessage !== 'null') {
      invitationMessage = obj.invitationMessage;
    }

    return { response, invitationMessage };
  } catch (error) {
    console.warn('[JSON Extractor] Failed to extract invitation response:', error);
    return fallback;
  }
}
