import { validateId } from './validation';

export type PendingConfirmation = { draftId: string; requestId: string };
export type PendingUndo = { receiptId: string; requestId: string };

function parse(raw: string | null, field: 'draftId' | 'receiptId') {
  if (!raw || raw.length > 512) return null;
  try {
    const value = JSON.parse(raw);
    return { target: validateId(value?.[field]), requestId: validateId(value?.requestId) };
  } catch { return null; }
}

export function pendingConfirmation(raw: string | null): PendingConfirmation | null {
  const value = parse(raw, 'draftId');
  return value ? { draftId: value.target, requestId: value.requestId } : null;
}
export function pendingUndo(raw: string | null): PendingUndo | null {
  const value = parse(raw, 'receiptId');
  return value ? { receiptId: value.target, requestId: value.requestId } : null;
}
