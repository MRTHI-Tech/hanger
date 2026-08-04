import {Hono} from 'hono';
import {mockMode} from '../env.js';
import {clearForcedError, currentForcedError, forceNextError} from '../mock.js';
import {ERROR_CODES, humanize} from '../youcam/errors.js';

/**
 * Development-only helpers, mounted only in mock mode.
 *
 * §15.7 asks us to force every error path and check each one renders a human
 * sentence and a next action. Doing that by hand — bad photos, expired tasks,
 * a drained account — isn't practical, so the mock can be told to fail with a
 * given code on the next task.
 */
export const devRoutes = new Hono();

devRoutes.get('/errors', (c) =>
  c.json({
    forced: currentForcedError(),
    codes: ERROR_CODES.map((code) => {
      const h = humanize(code);
      return {code, message: h.message, hint: h.hint, status: h.status};
    }),
  }),
);

devRoutes.post('/force-error', async (c) => {
  if (!mockMode) {
    return c.json(
      {
        error: {
          code: 'invalid_request',
          message: 'Forced errors only work on sample data.',
        },
      },
      400,
    );
  }
  const body = (await c.req.json().catch(() => ({}))) as {
    code?: string;
    sticky?: boolean;
  };
  if (!body.code) {
    clearForcedError();
    return c.json({forced: null});
  }
  forceNextError(body.code, Boolean(body.sticky));
  return c.json({forced: body.code});
});
