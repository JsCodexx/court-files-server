import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { throwDbError } from '../utils/dbError';

interface CityRow {
  id: string;
  user_id: string;
  label: string;
  created_at: string;
}

export interface CityDto {
  id: string;
  label: string;
}

function toDto(row: CityRow): CityDto {
  return { id: row.id, label: row.label };
}

export async function listCities(userId: string): Promise<CityDto[]> {
  const { data, error } = await supabase
    .from('user_cities')
    .select('*')
    .eq('user_id', userId)
    .order('label', { ascending: true });

  if (error) throwDbError(error, 'listCities');
  return ((data as CityRow[]) ?? []).map(toDto);
}

export async function addCity(userId: string, label: string): Promise<CityDto> {
  const trimmed = label.trim();
  if (!trimmed) throw new AppError('City name is required', 400);

  const existing = await findByLabel(userId, trimmed);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('user_cities')
    .insert({ user_id: userId, label: trimmed })
    .select('*')
    .single();

  if (error || !data) {
    const again = await findByLabel(userId, trimmed);
    if (again) return again;
    throw new AppError(error?.message || 'Failed to save city', 500);
  }

  return toDto(data as CityRow);
}

async function findByLabel(
  userId: string,
  label: string
): Promise<CityDto | null> {
  const { data, error } = await supabase
    .from('user_cities')
    .select('*')
    .eq('user_id', userId)
    .ilike('label', label.trim());

  if (error) return null;
  const rows = (data as CityRow[]) ?? [];
  const match = rows.find(
    (r) => r.label.trim().toLowerCase() === label.trim().toLowerCase()
  );
  return match ? toDto(match) : null;
}
