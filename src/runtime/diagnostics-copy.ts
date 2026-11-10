import type { FieldDiagnostic } from '../execution/diagnostics';

/** Copy the diagnosis ONLY to the local clipboard. No upload, no logger,
    no storage write, no persistence of any kind. */
export async function copyDiagnosticsJson(
  entries: readonly FieldDiagnostic[],
): Promise<boolean> {
  const payload = JSON.stringify(
    {
      tool: 'form-auto-filler',
      generatedAt: new Date().toISOString(),
      items: entries,
    },
    null,
    2,
  );
  try {
    const clipboard = navigator.clipboard;
    if (clipboard && typeof clipboard.writeText === 'function') {
      await clipboard.writeText(payload);
      return true;
    }
  } catch {
    // Fall through to the local, offline execCommand fallback.
  }
  try {
    const area = document.createElement('textarea');
    area.value = payload;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}
