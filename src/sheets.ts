export type SheetMode = 'ask' | 'allow' | 'deny';

export type SheetRequest = {
  title: string;
  body: string;
  input?: {
    label: string;
    value: string;
    placeholder?: string;
  };
};

export type SheetResult =
  | { decision: 'allow'; input: string }
  | { decision: 'deny' }
  | { decision: 'error' };

export function isSheetMode(value: string): value is SheetMode {
  return value === 'ask' || value === 'allow' || value === 'deny';
}

export function createSheetController(options: {
  getMode: () => SheetMode;
  render: (request: SheetRequest | null) => void;
  readInput: () => string;
}): {
  ask: (request: SheetRequest) => Promise<SheetResult>;
  decide: (decision: SheetResult['decision']) => void;
  cancelAll: () => void;
} {
  type Pending = {
    request: SheetRequest;
    resolve: (result: SheetResult) => void;
  };

  const queue: Pending[] = [];
  let current: Pending | null = null;

  const showNext = (): void => {
    if (current) return;
    const next = queue.shift();
    if (!next) {
      options.render(null);
      return;
    }
    current = next;
    options.render(next.request);
  };

  const ask = (request: SheetRequest): Promise<SheetResult> => {
    const mode = options.getMode();
    if (mode === 'allow') {
      return Promise.resolve({ decision: 'allow', input: request.input?.value ?? '' });
    }
    if (mode === 'deny') {
      return Promise.resolve({ decision: 'deny' });
    }

    return new Promise(resolve => {
      queue.push({ request, resolve });
      showNext();
    });
  };

  const decide = (decision: SheetResult['decision']): void => {
    if (!current) return;
    const pending = current;
    current = null;
    pending.resolve(
      decision === 'allow' ? { decision: 'allow', input: options.readInput() } : { decision },
    );
    showNext();
  };

  const cancelAll = (): void => {
    const pending = [...queue];
    queue.length = 0;
    if (current) pending.push(current);
    current = null;
    options.render(null);
    for (const item of pending) item.resolve({ decision: 'deny' });
  };

  return { ask, decide, cancelAll };
}
