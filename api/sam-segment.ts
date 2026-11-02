// Vercel server function: POST { image, concept } → SAM 3.1 segmentation masks.
// Image is a JPEG/PNG/WebP data URL (≤2M chars); concept is one short noun
// phrase ("shirt"). Calls the hosted SAM API through the Responses API with
// the OpenAI SDK, parses the streamed grammar with the official @meta-sam
// parser, and returns plain mask records (SVG path + raster size + box).
// Verified against the official cookbook (meta-models/meta-model-cookbook
// 07_sam/01_basics, model 'sam-3.1', baseURL https://api.meta.ai/v1).
// Key handling matches interpret.ts: MUSE_API_KEY from process.env only.

import OpenAI from 'openai';
import {
  decodeMaskToSVGPath,
  parseImageStream,
  recordsOfKind,
  type ResponsesEvent,
  type SegmentationResult,
} from '@meta-sam/parser';

const MAX_IMAGE_CHARS = 2000000;
const MAX_CONCEPT_CHARS = 40;
/** Upstream budget for segmentation streaming, inside the client's ~65s timeout. */
const UPSTREAM_TIMEOUT_MS = 55000;

interface ProxyReq {
  method?: string;
  body?: unknown;
}

interface ProxyRes {
  status: (code: number) => ProxyRes;
  json: (obj: unknown) => void;
  setHeader: (name: string, value: string) => void;
}

function err(res: ProxyRes, code: number, message: string): void {
  res.status(code).json({ error: message });
}

type EventStream = AsyncIterable<ResponsesEvent>;

/** The API streams response.content_part.done but not the output_text.done the
    parser uses to finalize a text lane — synthesize it (official cookbook fix). */
async function* normalizedEvents(stream: AsyncIterable<unknown>): EventStream {
  const completed = new Set<string>();
  for await (const raw of stream) {
    const event = raw as {
      type?: string;
      item_id?: unknown;
      output_index?: unknown;
      content_index?: unknown;
      part?: { type?: unknown; text?: unknown } | null;
    };
    const lane = `${String(event.item_id)}:${String(event.output_index)}:${String(event.content_index)}`;
    if (event.type === 'response.output_text.done') {
      if (!completed.has(lane)) {
        completed.add(lane);
        yield event as unknown as ResponsesEvent;
      }
      continue;
    }
    yield event as unknown as ResponsesEvent;
    if (
      event.type === 'response.content_part.done' &&
      !completed.has(lane) &&
      event.part &&
      typeof event.part === 'object' &&
      event.part.type === 'output_text' &&
      typeof event.part.text === 'string'
    ) {
      completed.add(lane);
      yield {
        type: 'response.output_text.done',
        item_id: event.item_id,
        output_index: event.output_index,
        content_index: event.content_index,
        text: event.part.text,
      } as unknown as ResponsesEvent;
    }
  }
}

function validateResult(result: SegmentationResult): string | null {
  const errors = result.diagnostics.filter((item) => item.severity === 'error');
  if (errors.length > 0) {
    return errors.map((item) => `line ${item.line}: ${item.message}`).join('; ').slice(0, 300);
  }
  return null;
}

export default async function handler(req: ProxyReq, res: ProxyRes): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.status(204).json({});
    return;
  }
  if (req.method !== 'POST') {
    err(res, 405, 'method not allowed');
    return;
  }

  let body: unknown = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown;
    } catch {
      err(res, 400, 'invalid json');
      return;
    }
  }
  const image = (body as { image?: unknown } | null)?.image;
  const concept = (body as { concept?: unknown } | null)?.concept;
  if (typeof image !== 'string' || !image.startsWith('data:image/') || image.length > MAX_IMAGE_CHARS) {
    err(res, 400, 'image is required (data URL)');
    return;
  }
  if (typeof concept !== 'string' || !concept.trim() || concept.trim().length > MAX_CONCEPT_CHARS) {
    err(res, 400, 'concept is required (short noun phrase)');
    return;
  }

  const key = process.env.MUSE_API_KEY;
  if (!key) {
    err(res, 500, 'proxy not configured');
    return;
  }

  const client = new OpenAI({ baseURL: 'https://api.meta.ai/v1', apiKey: key });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS);
  let result: SegmentationResult;
  try {
    const stream = await client.responses.create({
      model: 'sam-3.1',
      stream: true,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: concept.trim() },
            { type: 'input_image', image_url: image, detail: 'auto' },
          ],
        },
      ],
    }, { signal: ctrl.signal });
    result = await parseImageStream(normalizedEvents(stream as unknown as AsyncIterable<unknown>)).finalResult;
  } catch {
    clearTimeout(timer);
    err(res, 502, 'segmentation unavailable');
    return;
  }
  clearTimeout(timer);

  const rejected = validateResult(result);
  if (rejected) {
    err(res, 502, 'segmentation unavailable');
    return;
  }
  const masks = recordsOfKind(result.records, 'mask').slice(0, 12).map((record) => ({
    objectId: String(record.objectId),
    svg: decodeMaskToSVGPath(record.mask),
    width: record.mask.width,
    height: record.mask.height,
    box: {
      left: record.bounds.left,
      top: record.bounds.top,
      right: record.bounds.right,
      bottom: record.bounds.bottom,
    },
  }));
  res.status(200).json({ masks, outcome: result.outcome.status, model: 'sam-3.1' });
}
