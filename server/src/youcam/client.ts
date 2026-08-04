import {env} from '../env.js';
import {assertBudget, recordSpend} from '../budget.js';
import {CodedError} from './errors.js';
import type {TryOnCategory} from '../types.js';

/**
 * Live YouCam / Perfect Corp client (§5).
 *
 * Everything here runs server-side only. The API key never leaves this
 * process — §2.1 — and the extension has no path to it.
 */

const BASE = env.YOUCAM_API_BASE;

function authHeaders(): Record<string, string> {
  if (!env.YOUCAM_API_KEY) {
    throw new CodedError('upstream_error', 'YOUCAM_API_KEY is not set');
  }
  return {Authorization: `Bearer ${env.YOUCAM_API_KEY}`};
}

/** One retry after 5s on 429, per §13. */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retriedOn429 = false,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 429) {
    if (retriedOn429) throw new CodedError('rate_limited');
    await sleep(5000);
    return fetchWithRetry(url, init, true);
  }
  return res;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/** Pulls a §13 code out of whatever shape the error came back in. */
async function readError(res: Response): Promise<never> {
  let code: string | undefined;
  let raw = '';
  try {
    raw = await res.text();
    const body = JSON.parse(raw) as {
      error?: string;
      error_code?: string;
      message?: string;
      data?: {error?: string};
    };
    code = body.error ?? body.error_code ?? body.data?.error;
    if (!code && typeof body.message === 'string') code = body.message;
  } catch {
    /* non-JSON */
  }
  if (res.status === 429) code = 'rate_limited';
  if (!code && res.status >= 500) code = 'upstream_error';
  console.error(
    `[hanger] youcam ${res.status} ${code ?? 'unknown'} — ${raw.slice(0, 400)}`,
  );
  throw new CodedError(code ?? 'upstream_error');
}

export interface FileUploadRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
}

/**
 * §5.1 — register the file, then PUT the bytes to the presigned URL.
 * `file_size` has to be the exact byte length or the PUT is rejected.
 */
export async function uploadFile(
  bytes: Buffer,
  contentType: string,
  fileName: string,
): Promise<string> {
  const registerRes = await fetchWithRetry(`${BASE}/s2s/v2.0/file`, {
    method: 'POST',
    headers: {...authHeaders(), 'Content-Type': 'application/json'},
    body: JSON.stringify({
      files: [
        {
          content_type: contentType,
          file_name: fileName,
          file_size: bytes.byteLength,
        },
      ],
    }),
  });
  if (!registerRes.ok) await readError(registerRes);

  const registered = (await registerRes.json()) as {
    data?: {files?: {file_id: string; requests?: FileUploadRequest[]}[]};
  };
  const file = registered.data?.files?.[0];
  if (!file?.file_id || !file.requests?.[0]) {
    console.error('[hanger] unexpected /file response:', JSON.stringify(registered));
    throw new CodedError('upstream_error', 'file registration returned no upload target');
  }

  const put = file.requests[0];
  const putRes = await fetchWithRetry(put.url, {
    method: put.method || 'PUT',
    headers: {
      ...(put.headers ?? {}),
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
    },
    body: new Uint8Array(bytes),
  });
  if (!putRes.ok) {
    console.error(`[hanger] presigned PUT failed: ${putRes.status}`);
    throw new CodedError('upstream_error', `upload PUT failed (${putRes.status})`);
  }

  return file.file_id;
}

export interface ClothTaskInput {
  srcFileId: string;
  refFileId: string;
  category: TryOnCategory;
  changeShoes?: boolean;
}

/** §5.2 — create the try-on task. Returns the task id. */
export async function createClothTask(input: ClothTaskInput): Promise<string> {
  assertBudget(1);

  const payload: Record<string, unknown> = {
    src_file_id: input.srcFileId,
    ref_file_id: input.refFileId,
    garment_category: input.category,
  };
  // Only meaningful for full_body / lower_body.
  if (input.category === 'full_body' || input.category === 'lower_body') {
    payload.change_shoes = Boolean(input.changeShoes);
  }

  const res = await fetchWithRetry(`${BASE}/s2s/v2.0/task/cloth-v3`, {
    method: 'POST',
    headers: {...authHeaders(), 'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
  });
  if (!res.ok) await readError(res);

  const body = (await res.json()) as {data?: {task_id?: string}};
  const taskId = body.data?.task_id;
  if (!taskId) {
    console.error('[hanger] unexpected task response:', JSON.stringify(body));
    throw new CodedError('upstream_error', 'task creation returned no task_id');
  }

  // The units are committed the moment the task exists, so log it here rather
  // than on success — a task that fails later still cost us.
  recordSpend('cloth-v3', 1);
  return taskId;
}

export interface PollResult {
  status: 'running' | 'success' | 'error';
  resultUrl?: string;
  errorCode?: string;
}

async function pollOnce(endpoint: string, taskId: string): Promise<PollResult> {
  const res = await fetchWithRetry(`${BASE}/s2s/v2.0/task/${endpoint}/${taskId}`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!res.ok) await readError(res);

  const body = (await res.json()) as {
    data?: {
      task_status?: string;
      status?: string;
      error?: string;
      results?: {url?: string} | {url?: string}[];
    };
  };
  const data = body.data ?? {};
  const status = (data.task_status ?? data.status ?? 'running') as PollResult['status'];

  if (status === 'error') {
    return {status: 'error', errorCode: data.error ?? 'upstream_error'};
  }
  if (status === 'success') {
    const results = data.results;
    const url = Array.isArray(results) ? results[0]?.url : results?.url;
    if (!url) {
      console.error('[hanger] success with no result url:', JSON.stringify(body));
      return {status: 'error', errorCode: 'upstream_error'};
    }
    return {status: 'success', resultUrl: url};
  }
  return {status: 'running'};
}

/**
 * §5.3 — 2s interval, 120s ceiling, easing off after 30s. We never stop polling
 * a task early: an abandoned task can expire into InvalidTaskId having already
 * consumed its units.
 */
export async function pollTask(
  endpoint: string,
  taskId: string,
  onTick?: (elapsedMs: number) => void,
): Promise<string> {
  const started = Date.now();
  let interval = 2000;

  for (;;) {
    const elapsed = Date.now() - started;
    if (elapsed > 120_000) throw new CodedError('timeout');

    const result = await pollOnce(endpoint, taskId);
    if (result.status === 'success') return result.resultUrl!;
    if (result.status === 'error') {
      throw new CodedError(result.errorCode ?? 'upstream_error');
    }

    onTick?.(elapsed);
    if (elapsed > 30_000) interval = Math.min(interval * 1.5, 8000);
    await sleep(interval);
  }
}

/**
 * §2.6 — signed result URLs live in a ttl30 bucket, so we pull the bytes down
 * the moment the task succeeds and never store the URL.
 */
export async function downloadResult(
  url: string,
): Promise<{bytes: Buffer; contentType: string}> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[hanger] result download failed: ${res.status}`);
    throw new CodedError('InvalidTaskId', `result download failed (${res.status})`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    bytes,
    contentType: res.headers.get('content-type') ?? 'image/jpeg',
  };
}
