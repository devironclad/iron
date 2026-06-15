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

    const userName =
      session.user.user_metadata?.full_name ||
      session.user.email ||
      'Unknown';

    await supabase.from('ls_audit_logs').insert({
      action_type: entry.action_type,
      asset_id:    entry.asset_id,
      user_id:     session.user.id,
      field_name:  entry.field_name  ?? null,
      old_value:   entry.old_value   ?? null,
      new_value:   entry.new_value   ?? null,
      meta: { user_name: userName, ...entry.meta },
    });
  } catch {
    // Audit logging must never break the main flow
  }
}
