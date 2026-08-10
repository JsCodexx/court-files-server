import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { CasePersonDto, PersonRole } from '../types';

interface PersonRow {
  id: string;
  user_id: string;
  name: string;
  role: string;
  phone: string;
  created_at: string;
  updated_at: string;
}

function toPerson(row: PersonRow): CasePersonDto {
  return {
    id: row.id,
    name: row.name,
    role: row.role as PersonRole,
    phone: row.phone ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listPersons(
  userId: string,
  role?: PersonRole
): Promise<CasePersonDto[]> {
  let q = supabase
    .from('case_persons')
    .select('*')
    .eq('user_id', userId)
    .order('name', { ascending: true });

  if (role) q = q.eq('role', role);

  const { data, error } = await q;
  if (error) throw new AppError(error.message, 500);
  return ((data as PersonRow[]) ?? []).map(toPerson);
}

export async function createPerson(
  userId: string,
  input: { name: string; role: PersonRole; phone?: string }
): Promise<CasePersonDto> {
  const name = input.name.trim();
  if (!name) throw new AppError('Person name is required', 400);
  if (input.role !== 'judge' && input.role !== 'advocate') {
    throw new AppError('Invalid person role', 400);
  }

  const existing = await findPersonByName(userId, name, input.role);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('case_persons')
    .insert({
      user_id: userId,
      name,
      role: input.role,
      phone: input.phone?.trim() ?? '',
    })
    .select('*')
    .single();

  if (error || !data) {
    // Unique race: fetch existing
    const again = await findPersonByName(userId, name, input.role);
    if (again) return again;
    throw new AppError(error?.message || 'Failed to create person', 500);
  }

  return toPerson(data as PersonRow);
}

export async function findPersonByName(
  userId: string,
  name: string,
  role: PersonRole
): Promise<CasePersonDto | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from('case_persons')
    .select('*')
    .eq('user_id', userId)
    .eq('role', role)
    .ilike('name', trimmed);

  if (error) throw new AppError(error.message, 500);
  const rows = (data as PersonRow[]) ?? [];
  const exact = rows.find(
    (r) => r.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  return exact ? toPerson(exact) : null;
}

export async function getPersonForUser(
  userId: string,
  personId: string,
  role?: PersonRole
): Promise<CasePersonDto> {
  let q = supabase
    .from('case_persons')
    .select('*')
    .eq('id', personId)
    .eq('user_id', userId);

  if (role) q = q.eq('role', role);

  const { data, error } = await q.maybeSingle();
  if (error) throw new AppError(error.message, 500);
  if (!data) throw new AppError('Person not found', 404);
  return toPerson(data as PersonRow);
}

/**
 * Resolve a directory person from an id and/or name.
 * Creates a new directory row when only a name is provided.
 */
export async function resolvePerson(
  userId: string,
  role: PersonRole,
  opts: { personId?: string | null; name?: string | null }
): Promise<{ id: string | null; name: string }> {
  if (opts.personId) {
    const person = await getPersonForUser(userId, opts.personId, role);
    return { id: person.id, name: person.name };
  }

  const name = (opts.name ?? '').trim();
  if (!name) return { id: null, name: '' };

  const person = await createPerson(userId, { name, role });
  return { id: person.id, name: person.name };
}

export async function updatePerson(
  userId: string,
  personId: string,
  patch: { name?: string; phone?: string }
): Promise<CasePersonDto> {
  await getPersonForUser(userId, personId);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new AppError('Person name is required', 400);
    updates.name = name;
  }
  if (patch.phone !== undefined) updates.phone = patch.phone.trim();

  const { data, error } = await supabase
    .from('case_persons')
    .update(updates)
    .eq('id', personId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error || !data) {
    throw new AppError(error?.message || 'Failed to update person', 500);
  }
  return toPerson(data as PersonRow);
}
