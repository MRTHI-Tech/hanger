/**
 * The page the phone opens. Deliberately one file with no build step and no
 * assets: it's served to a device that has never spoken to us before, over a
 * home Wi-Fi connection, and every extra request is another thing to fail.
 *
 * Why a file input rather than a live camera preview: `getUserMedia` requires a
 * secure context, and this page is plain http on a LAN address. Both Safari and
 * Chrome refuse the camera there, and the fix would be a self-signed
 * certificate the phone has to be talked into trusting. The `capture` attribute
 * has no such restriction — it hands off to the phone's own camera app, which
 * is a better camera UI than we would build anyway.
 */

/** Matches the panel: butter cream, the exact brand blue. */
const CREAM = '#FDFBE4';
const INK = '#1D1C11';
const ACCENT = '#225BFF';
const MUTED = '#605F52';

export function phonePage({
  token,
  expired,
}: {
  token: string;
  expired: boolean;
}): string {
  // A token only reaches the script when it matched a live session, so what's
  // interpolated below is always our own hex. Nothing from the URL is echoed
  // on the expired path.
  const body = expired ? expiredBody() : captureBody(token);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Hanger</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
    background: ${CREAM};
    color: ${INK};
    font: 17px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  h1 { font-size: 24px; line-height: 1.2; margin: 0; }
  p { margin: 0; color: ${MUTED}; }
  .brand { font-size: 15px; letter-spacing: 0.02em; color: ${ACCENT}; font-weight: 600; margin: 0; }
  label.pick, button {
    -webkit-appearance: none;
    appearance: none;
    display: block;
    width: 100%;
    padding: 18px 20px;
    border-radius: 14px;
    border: none;
    background: ${ACCENT};
    color: #fff;
    font: inherit;
    font-weight: 600;
    text-align: center;
    cursor: pointer;
  }
  button.secondary { background: transparent; color: ${ACCENT}; border: 1px solid ${ACCENT}; }
  button[disabled] { opacity: 0.55; }
  input[type=file] { position: absolute; width: 1px; height: 1px; opacity: 0; }
  img.preview {
    width: 100%;
    max-height: 46vh;
    object-fit: contain;
    border-radius: 14px;
    background: #fff;
    border: 1px solid rgba(29,28,17,0.12);
  }
  .hint { font-size: 15px; }
  .done { font-size: 20px; font-weight: 600; }
  .hidden { display: none; }
  .spacer { flex: 1; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function expiredBody(): string {
  return `<p class="brand">Hanger</p>
<h1>That code has expired</h1>
<p>Codes last five minutes. Open Hanger on your laptop and tap "Use my phone" again for a fresh one.</p>`;
}

function captureBody(token: string): string {
  return `<p class="brand">Hanger</p>
<h1 id="title">Photograph the piece</h1>
<p id="hint" class="hint">One piece at a time, laid flat or on a hanger, filling the frame.</p>

<div class="spacer"></div>

<img id="preview" class="preview hidden" alt="">

<label class="pick" id="pickLabel" for="file">Open the camera</label>
<input id="file" type="file" accept="image/*" capture="environment">

<button id="send" class="hidden">Send to my laptop</button>
<button id="retake" class="secondary hidden">Take another</button>

<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var MAX_SIDE = 2048;

  var file = document.getElementById('file');
  var preview = document.getElementById('preview');
  var pickLabel = document.getElementById('pickLabel');
  var send = document.getElementById('send');
  var retake = document.getElementById('retake');
  var title = document.getElementById('title');
  var hint = document.getElementById('hint');
  var blob = null;

  function show(el, on) { el.classList[on ? 'remove' : 'add']('hidden'); }

  file.addEventListener('change', function () {
    var chosen = file.files && file.files[0];
    if (!chosen) return;
    hint.textContent = 'Getting it ready';
    shrink(chosen, function (out, url) {
      blob = out;
      preview.src = url;
      show(preview, true);
      show(pickLabel, false);
      show(send, true);
      show(retake, true);
      title.textContent = 'Does that look right?';
      hint.textContent = 'It goes straight to the Hanger panel on your laptop.';
    });
  });

  retake.addEventListener('click', function () {
    file.value = '';
    file.click();
  });

  send.addEventListener('click', function () {
    if (!blob) return;
    send.disabled = true;
    retake.disabled = true;
    send.textContent = 'Sending';

    var form = new FormData();
    form.append('photo', blob, 'phone.jpg');

    fetch('/handoff/' + TOKEN + '/photo', {method: 'POST', body: form})
      .then(function (res) {
        if (!res.ok) {
          return res.json().catch(function () { return null; }).then(function (body) {
            throw new Error(
              (body && body.error && body.error.message) ||
              'That did not send. Try again.'
            );
          });
        }
        document.body.innerHTML =
          '<p class="brand">Hanger</p>' +
          '<h1>Sent</h1>' +
          '<p>Look back at your laptop — it is already there. You can close this.</p>';
      })
      .catch(function (err) {
        send.disabled = false;
        retake.disabled = false;
        send.textContent = 'Send to my laptop';
        hint.textContent = err.message;
      });
  });

  /**
   * Phone cameras shoot well past what the try-on service accepts, and a 12MP
   * upload over home Wi-Fi is a long wait for no benefit. Re-encoding also
   * normalises whatever the phone produced (HEIC included) into a JPEG the
   * laptop can read.
   */
  function shrink(input, done) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (out) {
          // A browser that cannot re-encode still gets to send the original.
          done(out || input, canvas.toDataURL('image/jpeg', 0.7));
        }, 'image/jpeg', 0.9);
      };
      img.onerror = function () { done(input, reader.result); };
      img.src = reader.result;
    };
    reader.readAsDataURL(input);
  }
})();
</script>`;
}
