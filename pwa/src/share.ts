/**
 * The phone's own share sheet.
 *
 * This is the one thing the phone does that the laptop genuinely cannot. On
 * desktop, sending an outfit video to somebody is a download, a file manager,
 * and a drag into a chat window. Here it is the OS sheet with WhatsApp,
 * Instagram and Messages already in it, and the platform does all of the work.
 *
 * Two facts about `navigator.share` shape everything below.
 *
 * **It shares files, not links.** Which is what we want anyway: our media URLs
 * are signed and short-lived (`server/src/media.ts`), and in development they
 * point at a LAN address that means nothing on the other end of a WhatsApp
 * thread. A link would arrive broken or expire in someone's chat history. The
 * bytes are the thing worth sending.
 *
 * **It needs the tap.** The call has to happen while the browser still counts
 * you as having just tapped something, and on iOS an `await fetch()` in the
 * handler spends that. So the file is fetched *before* the tap — see
 * `components/ShareCard.tsx` — and the handler only opens the sheet.
 */

/**
 * Whether this browser can share files at all.
 *
 * Deliberately a cheap capability check rather than a real one: a true answer
 * still has to be confirmed against the actual file, because a browser can
 * share pictures and refuse video. That check is in `shareFile`, which is where
 * the file exists.
 *
 * False on desktop Firefox, and on Chrome unless it is a phone. Those get the
 * download instead, which is the honest desktop answer.
 */
export function canShareFiles(): boolean {
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function';
}

/** The sheet opened and they picked something, or they backed out of it. */
export type ShareOutcome = 'shared' | 'dismissed';

/**
 * This browser has a share sheet but won't take this particular file. Separate
 * from a failure because nothing went wrong — there is simply nowhere to send
 * it, and the only useful thing left to offer is the download.
 */
export class ShareRefused extends Error {
  constructor() {
    super('This phone will not share that kind of file.');
  }
}

/**
 * Fetch what's on screen as a file, ready to hand to the sheet.
 *
 * Almost always free: the same URL is already on the page as a `<video>` or an
 * `<img>`, and media is served `immutable` with a year on it, so this is a
 * cache hit rather than a second download.
 */
export async function fileFromUrl(
  url: string,
  name: string,
  signal?: AbortSignal,
): Promise<File> {
  const res = await fetch(url, {signal});
  if (!res.ok) throw new Error(`Media responded ${res.status}`);
  const blob = await res.blob();
  const type = blob.type || typeFromUrl(url);
  return new File([blob], fileName(name, url, type), {type});
}

/**
 * Open the sheet. Resolves once they've chosen a target or dismissed it.
 *
 * The share carries the file and a title and no `text`. That is not an
 * oversight: several targets — WhatsApp among them, which is the one the phase
 * is measured on — treat a share that has text in it as a *text* share and
 * quietly drop the attachment. A caption is worth less than the video arriving.
 */
export async function shareFile(file: File, title: string): Promise<ShareOutcome> {
  const data = {files: [file], title};
  if (!navigator.canShare?.(data)) throw new ShareRefused();
  try {
    await navigator.share(data);
    return 'shared';
  } catch (error) {
    // Backing out of the sheet is not a failure, and every browser reports it
    // the same way. Anything else is worth showing.
    if (error instanceof DOMException && error.name === 'AbortError') {
      return 'dismissed';
    }
    throw error;
  }
}

/**
 * Save it to the phone instead — the fallback when there is no sheet, and the
 * way out when the sheet refuses the file.
 *
 * Goes through a blob URL rather than linking straight at the server, because
 * `download` is ignored on a cross-origin link: the phone app and the API are
 * different origins, so a direct link would navigate away to the video instead
 * of saving it.
 */
export function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Long enough for the browser to have started reading it.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** What a share failure means to somebody holding the phone. */
export function shareErrorMessage(error: unknown): string {
  if (error instanceof ShareRefused) return error.message;
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return "Your phone wouldn't open the share sheet. Tap it once more.";
  }
  return "We couldn't get it ready to send. Try that again.";
}

const EXTENSION_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
};

function extensionOf(url: string): string | null {
  const match = /\.([a-z0-9]+)(?:\?|#|$)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

/** For a server that answered without a content type. */
function typeFromUrl(url: string): string {
  const ext = extensionOf(url);
  return (ext && EXTENSION_TYPES[ext]) || 'application/octet-stream';
}

/**
 * A name somebody would recognise in their downloads or in a chat.
 *
 * The extension has to be right — a `.mp4` named `.png` arrives as a file
 * nothing will play — so it comes from the URL, or from the content type when
 * the URL has nothing to say.
 */
function fileName(name: string, url: string, type: string): string {
  const stem =
    name
      // Illegal in filenames on one platform or another, so out everywhere.
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'Outfit';

  const ext =
    extensionOf(url) ??
    Object.entries(EXTENSION_TYPES).find(([, t]) => t === type)?.[0] ??
    'bin';

  return `${stem}.${ext}`;
}
