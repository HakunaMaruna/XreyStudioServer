/* eslint-disable @typescript-eslint/no-var-requires */
// Plugin worker: isolated process, JSON-lines IPC. No direct DB/env access.
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void };

const waiters = new Map<number, Pending>();
let requestId = 0;

function send(message: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function request(type: string, payload: Record<string, unknown>) {
  return new Promise<any>((resolve, reject) => {
    const id = ++requestId;
    waiters.set(id, { resolve, reject });
    send({ type, id, payload });
  });
}

const sdk = {
  storage: {
    get: (key: string) => request('storage.get', { key }),
    set: (key: string, value: unknown) => request('storage.set', { key, value }),
    delete: (key: string) => request('storage.delete', { key }),
  },
  settings: {
    get: () => request('settings.get', {}),
  },
  log: (level: string, message: string) => send({ type: 'log', level, message }),
  http: {
    request: (url: string, options: Record<string, unknown> = {}) => request('http.request', { url, ...options }),
  },
  events: {
    emit: (event: string, payload: unknown) => request('events.emit', { event, payload }),
  },
};

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    let message: any;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.type === 'response') {
      const item = waiters.get(message.id);
      if (item) {
        waiters.delete(message.id);
        if (message.error) item.reject(new Error(message.error));
        else item.resolve(message.value);
      }
      continue;
    }
    if (message.type !== 'invoke') continue;
    (async () => {
      try {
        const dir = process.env.XSS_PLUGIN_DIR || '';
        const settings = JSON.parse(process.env.XSS_PLUGIN_SETTINGS || '{}');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require(`${dir}/${(process.env.XSS_PLUGIN_ENTRY || '').replace(/^\//, '')}`);
        const fn = mod[message.hook] || mod.default?.[message.hook];
        const value = typeof fn === 'function' ? await fn(sdk, { settings }) : null;
        send({ type: 'result', id: message.id, value: value ?? null });
      } catch (error: any) {
        send({ type: 'result', id: message.id, error: error?.message || 'plugin error' });
      }
    })();
  }
});

export {};
