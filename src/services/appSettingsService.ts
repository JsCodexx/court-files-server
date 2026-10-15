import { supabase } from '../db';
import { throwDbError } from '../utils/dbError';

export async function getSetting(
  key: string,
  fallback: string
): Promise<string> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error) throwDbError(error, 'getSetting');
  if (!data?.value) return fallback;
  return String(data.value);
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert(
    {
      key,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );

  if (error) throwDbError(error, 'setSetting');
}
