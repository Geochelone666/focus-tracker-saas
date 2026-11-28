'use server';

import { revalidatePath } from 'next/cache';
import { planningContext } from '@/lib/planning-data';

export type PrivacyState = { error?: string; success?: string };

export async function revokeConnections(
  _state: PrivacyState,
  form: FormData
): Promise<PrivacyState> {
  if (form.get('confirm') !== 'revoke') {
    return { error: 'Confirm that you want to revoke your AI keys and pause reminders.' };
  }
  const { supabase } = await planningContext();
  try {
    const { error } = await supabase.rpc('revoke_account_connections');
    if (error) return { error: 'Could not update your connections. Retry to check them safely.' };
  } catch {
    return { error: 'The response was interrupted. Retry to check your connections safely.' };
  }
  for (const path of ['/settings/privacy', '/settings/integrations', '/settings/notifications']) {
    revalidatePath(path);
  }
  return {
    success: 'All existing AI keys are revoked and registered device reminders are paused. You can create new keys or enable reminders again in Settings.',
  };
}
