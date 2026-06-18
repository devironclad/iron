import { supabase } from './supabase';

export type AuditActionType =
  | 'AUCTION_CREATE'
  | 'AUCTION_BUY'
  | 'TAX_ADD'
  | 'TAX_EDIT'
  | 'AMENITY_ADD'
  | 'AMENITY_DELETE'
  | 'FIELD_UPDATE';

interface AuditEntry {
  action_type: AuditActionType;
  asset_id: number;
  field_name?: string;
  old_value?: string;
  new_value?: string;
  meta?: Record<string, any>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const user_name =
      session.user.user_metadata?.full_name ||
      session.user.email ||
      'Unknown';

    await fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ ...entry, user_name }),
    });
  } catch {
    // Audit logging must never break the main flow
  }
}
