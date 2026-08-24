import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';

interface ProceedingRow {
  id: string;
  user_id: string;
  label: string;
  created_at: string;
}

export interface ProceedingDto {
  id: string;
  label: string;
}

function toDto(row: ProceedingRow): ProceedingDto {
  return { id: row.id, label: row.label };
}

export async function listProceedings(userId: string): Promise<ProceedingDto[]> {
  const { data, error } = await supabase
    .from('user_proceedings')
    .select('*')
    .eq('user_id', userId)
    .order('label', { ascending: true });

  if (error) throw new AppError(error.message, 500);
  return ((data as ProceedingRow[]) ?? []).map(toDto);
}

export async function addProceeding(
  userId: string,
  label: string
): Promise<ProceedingDto> {
  const trimmed = label.trim();
  if (!trimmed) throw new AppError('Proceeding label is required', 400);

  const existing = await findByLabel(userId, trimmed);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('user_proceedings')
    .insert({ user_id: userId, label: trimmed })
    .select('*')
    .single();

  if (error || !data) {
    const again = await findByLabel(userId, trimmed);
    if (again) return again;
    throw new AppError(error?.message || 'Failed to save proceeding', 500);
  }

  return toDto(data as ProceedingRow);
}

async function findByLabel(
  userId: string,
  label: string
): Promise<ProceedingDto | null> {
  const { data, error } = await supabase
    .from('user_proceedings')
    .select('*')
    .eq('user_id', userId)
    .ilike('label', label.trim());

  if (error) return null;
  const rows = (data as ProceedingRow[]) ?? [];
  const match = rows.find(
    (r) => r.label.trim().toLowerCase() === label.trim().toLowerCase()
  );
  return match ? toDto(match) : null;
}
