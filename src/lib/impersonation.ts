const KEY = 'ironcladgroup_preview_partner';

export type PreviewPartner = { id: string; full_name: string };

export function getPreviewPartner(): PreviewPartner | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function startPreview(partner: PreviewPartner): void {
  sessionStorage.setItem(KEY, JSON.stringify(partner));
}

export function stopPreview(): void {
  sessionStorage.removeItem(KEY);
}
