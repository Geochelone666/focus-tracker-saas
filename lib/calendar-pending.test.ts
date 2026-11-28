import { expect, it } from 'vitest';
import { pendingConfirmation, pendingUndo } from './calendar-pending';

const target = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
it('restores only bounded UUID pairs and drops unrelated stored fields', () => {
  expect(pendingConfirmation(JSON.stringify({ draftId: target, requestId, extra: 'ignored' })))
    .toEqual({ draftId: target, requestId });
  expect(pendingUndo(JSON.stringify({ receiptId: target, requestId })))
    .toEqual({ receiptId: target, requestId });
});
it('ignores malformed, incomplete, oversized or mixed operation records', () => {
  for (const raw of [null, '', '{', 'null', '[]', '{}', '1', 'x'.repeat(513),
    JSON.stringify({ draftId: target }), JSON.stringify({ receiptId: target }),
    JSON.stringify({ draftId: 'not-an-id', receiptId: target, requestId: {} })]) {
    expect(pendingConfirmation(raw)).toBeNull();
    expect(pendingUndo(raw)).toBeNull();
  }
  expect(pendingConfirmation(JSON.stringify({ receiptId: target, requestId }))).toBeNull();
  expect(pendingUndo(JSON.stringify({ draftId: target, requestId }))).toBeNull();
});
