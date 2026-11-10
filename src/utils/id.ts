/** Request / session ids. No URL or field values ever enter these ids. */

let sequence = 0;

export function newRequestId(): string {
  sequence += 1;
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.floor(Math.random() * 0xffffffff).toString(16);
  return 'r-' + random + '-' + String(sequence);
}

export function newSessionId(): string {
  return 'faf-' + newRequestId();
}
