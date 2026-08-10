import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { AdvocateFor, CaseStatus, CourtCaseDto, CourtCategory } from '../types';
import { mapBenchHistory, mapCase } from '../utils/mappers';
import type { Case, Hearing } from '../db/schema';
import {
  benchChanged,
  hearingBenchFields,
  recordBenchHistory,
  resolveBench,
  type BenchSnapshot,
} from './benchService';

export interface CaseInput {
  caseId: string;
  category: CourtCategory;
  party1: { name: string; idCard: string; phone: string };
  party2: { name: string; idCard: string; phone: string };
  courtNumber?: string;
  city: string;
  judgeName: string;
  advocateFor: AdvocateFor;
  party1Advocate: string;
  party2Advocate: string;
  judgePersonId?: string | null;
  party1AdvocateId?: string | null;
  party2AdvocateId?: string | null;
  nextDate: string;
  proceeding: string;
  remarks: string;
  status?: CaseStatus;
  statusRemarks?: string;
  client: { name: string; address: string; phone: string };
}

interface CaseRow {
  id: string;
  user_id: string;
  case_id: string;
  category: string;
  party1_name: string;
  party1_id_card: string;
  party1_phone: string;
  party2_name: string;
  party2_id_card: string;
  party2_phone: string;
  court_number: string | null;
  city?: string;
  judge_name: string;
  advocate_for: string;
  party1_advocate?: string;
  party2_advocate?: string;
  judge_person_id?: string | null;
  party1_advocate_id?: string | null;
  party2_advocate_id?: string | null;
  next_date: string;
  proceeding: string;
  remarks: string;
  status: string;
  status_remarks?: string;
  client_name: string;
  client_address: string;
  client_phone: string;
  created_at: string;
  updated_at: string;
}

interface HearingRow {
  id: string;
  case_id: string;
  date: string;
  proceeding: string;
  adjournment_reason: string;
  short_order: string;
  remarks: string | null;
  judge_name?: string;
  party1_advocate?: string;
  party2_advocate?: string;
  judge_person_id?: string | null;
  party1_advocate_id?: string | null;
  party2_advocate_id?: string | null;
  created_at: string;
}

export interface HearingInput {
  date: string;
  proceeding: string;
  adjournmentReason?: string;
  shortOrder?: string;
  remarks?: string;
}

/** Calendar date in Asia/Karachi so Vercel UTC doesn't shift "today". */
function localISODate(offsetDays = 0): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const d = new Date(Date.UTC(y, m - 1, day + offsetDays));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** Hearings may be corrected only within 48 hours of creation. */
const HEARING_EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

function isHearingEditable(createdAt: string): boolean {
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return Date.now() - created <= HEARING_EDIT_WINDOW_MS;
}

function assertHearingEditable(createdAt: string): void {
  if (!isHearingEditable(createdAt)) {
    throw new AppError('hearing.editLocked', 403);
  }
}

async function getLatestHearingRow(
  caseInternalId: string
): Promise<{ id: string; created_at: string; date: string } | null> {
  const { data, error } = await supabase
    .from('hearings')
    .select('id, created_at, date')
    .eq('case_id', caseInternalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  return data as { id: string; created_at: string; date: string } | null;
}

/** Keep cases.next_date aligned with the chronologically latest hearing. */
async function syncNextDateFromHearings(caseInternalId: string): Promise<void> {
  const { data: latest, error } = await supabase
    .from('hearings')
    .select('date, proceeding, remarks')
    .eq('case_id', caseInternalId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!latest) return;

  const { error: updateError } = await supabase
    .from('cases')
    .update({
      next_date: latest.date,
      proceeding: latest.proceeding,
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseInternalId);

  if (updateError) throw new AppError(updateError.message, 500);
}

function toCase(row: CaseRow): Case {
  return {
    id: row.id,
    userId: row.user_id,
    caseId: row.case_id,
    category: row.category,
    party1Name: row.party1_name,
    party1IdCard: row.party1_id_card,
    party1Phone: row.party1_phone,
    party2Name: row.party2_name,
    party2IdCard: row.party2_id_card,
    party2Phone: row.party2_phone,
    courtNumber: row.court_number,
    city: row.city ?? '',
    judgeName: row.judge_name,
    advocateFor: row.advocate_for,
    party1Advocate: row.party1_advocate ?? '',
    party2Advocate: row.party2_advocate ?? '',
    judgePersonId: row.judge_person_id ?? null,
    party1AdvocateId: row.party1_advocate_id ?? null,
    party2AdvocateId: row.party2_advocate_id ?? null,
    nextDate: row.next_date,
    proceeding: row.proceeding,
    remarks: row.remarks,
    status: row.status ?? 'pending',
    statusRemarks: row.status_remarks ?? '',
    clientName: row.client_name,
    clientAddress: row.client_address,
    clientPhone: row.client_phone,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function toHearing(row: HearingRow): Hearing {
  return {
    id: row.id,
    caseId: row.case_id,
    date: row.date,
    proceeding: row.proceeding,
    adjournmentReason: row.adjournment_reason ?? '',
    shortOrder: row.short_order ?? '',
    remarks: row.remarks,
    judgeName: row.judge_name ?? '',
    party1Advocate: row.party1_advocate ?? '',
    party2Advocate: row.party2_advocate ?? '',
    judgePersonId: row.judge_person_id ?? null,
    party1AdvocateId: row.party1_advocate_id ?? null,
    party2AdvocateId: row.party2_advocate_id ?? null,
    createdAt: new Date(row.created_at),
  };
}

async function loadBenchHistory(caseIds: string[]) {
  if (caseIds.length === 0) {
    return new Map<string, ReturnType<typeof mapBenchHistory>[]>();
  }

  const { data, error } = await supabase
    .from('case_bench_history')
    .select('*')
    .in('case_id', caseIds)
    .order('effective_from', { ascending: false });

  if (error) throw new AppError(error.message, 500);

  const byCase = new Map<string, ReturnType<typeof mapBenchHistory>[]>();
  for (const row of data ?? []) {
    const list = byCase.get(row.case_id) ?? [];
    list.push(
      mapBenchHistory({
        id: row.id,
        judgePersonId: row.judge_person_id,
        party1AdvocateId: row.party1_advocate_id,
        party2AdvocateId: row.party2_advocate_id,
        judgeName: row.judge_name ?? '',
        party1Advocate: row.party1_advocate ?? '',
        party2Advocate: row.party2_advocate ?? '',
        effectiveFrom: row.effective_from,
        createdAt: row.created_at,
      })
    );
    byCase.set(row.case_id, list);
  }
  return byCase;
}

async function loadCasesWithHearings(
  caseRows: CaseRow[]
): Promise<CourtCaseDto[]> {
  if (caseRows.length === 0) return [];

  const ids = caseRows.map((c) => c.id);
  const { data: hearingRows, error } = await supabase
    .from('hearings')
    .select('*')
    .in('case_id', ids)
    .order('created_at', { ascending: false });

  if (error) throw new AppError(error.message, 500);

  const byCase = new Map<string, Hearing[]>();
  for (const h of (hearingRows as HearingRow[]) ?? []) {
    const list = byCase.get(h.case_id) ?? [];
    list.push(toHearing(h));
    byCase.set(h.case_id, list);
  }

  const benchByCase = await loadBenchHistory(ids);

  return caseRows.map((row) =>
    mapCase(toCase(row), byCase.get(row.id) ?? [], benchByCase.get(row.id) ?? [])
  );
}

export async function listCases(userId: string): Promise<CourtCaseDto[]> {
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw new AppError(error.message, 500);
  return loadCasesWithHearings((data as CaseRow[]) ?? []);
}

export async function getCaseById(
  userId: string,
  id: string
): Promise<CourtCaseDto> {
  const { data, error } = await supabase
    .from('cases')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!data) throw new AppError('Case not found', 404);

  const [mapped] = await loadCasesWithHearings([data as CaseRow]);
  return mapped;
}

export async function createCase(
  userId: string,
  input: CaseInput
): Promise<CourtCaseDto> {
  const bench = await resolveBench(userId, {
    judgePersonId: input.judgePersonId,
    party1AdvocateId: input.party1AdvocateId,
    party2AdvocateId: input.party2AdvocateId,
    judgeName: input.judgeName,
    party1Advocate: input.party1Advocate,
    party2Advocate: input.party2Advocate,
  });

  const { data: created, error } = await supabase
    .from('cases')
    .insert({
      user_id: userId,
      case_id: input.caseId.trim(),
      category: input.category,
      party1_name: input.party1.name.trim(),
      party1_id_card: input.party1.idCard.trim(),
      party1_phone: input.party1.phone.trim(),
      party2_name: input.party2.name.trim(),
      party2_id_card: input.party2.idCard.trim(),
      party2_phone: input.party2.phone.trim(),
      court_number: input.courtNumber?.trim() || null,
      city: input.city.trim(),
      judge_name: bench.judgeName,
      advocate_for: input.advocateFor,
      party1_advocate: bench.party1Advocate,
      party2_advocate: bench.party2Advocate,
      judge_person_id: bench.judgePersonId,
      party1_advocate_id: bench.party1AdvocateId,
      party2_advocate_id: bench.party2AdvocateId,
      next_date: input.nextDate,
      proceeding: input.proceeding.trim(),
      remarks: input.remarks?.trim() ?? '',
      status: input.status ?? 'pending',
      status_remarks: input.statusRemarks?.trim() ?? '',
      client_name: input.client?.name?.trim() ?? '',
      client_address: input.client?.address?.trim() ?? '',
      client_phone: input.client?.phone?.trim() ?? '',
    })
    .select('*')
    .single();

  if (error || !created) {
    throw new AppError(error?.message || 'Failed to create case', 500);
  }

  const { error: hearingError } = await supabase.from('hearings').insert({
    case_id: created.id,
    date: input.nextDate,
    proceeding: input.proceeding.trim(),
    remarks: input.remarks?.trim() || null,
    ...hearingBenchFields(bench),
  });

  if (hearingError) throw new AppError(hearingError.message, 500);

  await recordBenchHistory(created.id, bench);

  return getCaseById(userId, created.id);
}

export async function updateCase(
  userId: string,
  id: string,
  patch: Partial<CaseInput>
): Promise<CourtCaseDto> {
  const { data: existing, error: findError } = await supabase
    .from('cases')
    .select(
      'id, remarks, judge_name, party1_advocate, party2_advocate, judge_person_id, party1_advocate_id, party2_advocate_id'
    )
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();

  if (findError) throw new AppError(findError.message, 500);
  if (!existing) throw new AppError('Case not found', 404);

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (patch.caseId !== undefined) updates.case_id = patch.caseId.trim();
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.party1) {
    updates.party1_name = patch.party1.name.trim();
    updates.party1_id_card = patch.party1.idCard.trim();
    updates.party1_phone = patch.party1.phone.trim();
  }
  if (patch.party2) {
    updates.party2_name = patch.party2.name.trim();
    updates.party2_id_card = patch.party2.idCard.trim();
    updates.party2_phone = patch.party2.phone.trim();
  }
  if (patch.courtNumber !== undefined) {
    updates.court_number = patch.courtNumber.trim() || null;
  }
  if (patch.city !== undefined) updates.city = patch.city.trim();
  if (patch.advocateFor !== undefined) updates.advocate_for = patch.advocateFor;
  if (patch.nextDate !== undefined) updates.next_date = patch.nextDate;
  if (patch.proceeding !== undefined) updates.proceeding = patch.proceeding.trim();
  if (patch.remarks !== undefined) updates.remarks = patch.remarks.trim();
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.statusRemarks !== undefined) {
    updates.status_remarks = patch.statusRemarks.trim();
  } else if (patch.status === 'pending') {
    updates.status_remarks = '';
  }
  if (patch.client) {
    updates.client_name = patch.client.name.trim();
    updates.client_address = patch.client.address.trim();
    updates.client_phone = patch.client.phone.trim();
  }

  const benchTouched =
    patch.judgeName !== undefined ||
    patch.party1Advocate !== undefined ||
    patch.party2Advocate !== undefined ||
    patch.judgePersonId !== undefined ||
    patch.party1AdvocateId !== undefined ||
    patch.party2AdvocateId !== undefined;

  let nextBench: BenchSnapshot | null = null;
  if (benchTouched) {
    nextBench = await resolveBench(userId, {
      judgePersonId:
        patch.judgePersonId !== undefined
          ? patch.judgePersonId
          : patch.judgeName !== undefined
            ? null
            : existing.judge_person_id,
      party1AdvocateId:
        patch.party1AdvocateId !== undefined
          ? patch.party1AdvocateId
          : patch.party1Advocate !== undefined
            ? null
            : existing.party1_advocate_id,
      party2AdvocateId:
        patch.party2AdvocateId !== undefined
          ? patch.party2AdvocateId
          : patch.party2Advocate !== undefined
            ? null
            : existing.party2_advocate_id,
      judgeName:
        patch.judgeName !== undefined ? patch.judgeName : existing.judge_name,
      party1Advocate:
        patch.party1Advocate !== undefined
          ? patch.party1Advocate
          : existing.party1_advocate,
      party2Advocate:
        patch.party2Advocate !== undefined
          ? patch.party2Advocate
          : existing.party2_advocate,
    });

    updates.judge_name = nextBench.judgeName;
    updates.party1_advocate = nextBench.party1Advocate;
    updates.party2_advocate = nextBench.party2Advocate;
    updates.judge_person_id = nextBench.judgePersonId;
    updates.party1_advocate_id = nextBench.party1AdvocateId;
    updates.party2_advocate_id = nextBench.party2AdvocateId;
  }

  const { error } = await supabase.from('cases').update(updates).eq('id', id);
  if (error) throw new AppError(error.message, 500);

  if (patch.nextDate !== undefined || patch.proceeding !== undefined) {
    const { data: latest } = await supabase
      .from('hearings')
      .select('id, created_at')
      .eq('case_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest) {
      assertHearingEditable(latest.created_at);
      const hearingPatch: Record<string, unknown> = {};
      if (patch.nextDate !== undefined) hearingPatch.date = patch.nextDate;
      if (patch.proceeding !== undefined) {
        hearingPatch.proceeding = patch.proceeding.trim();
      }
      if (Object.keys(hearingPatch).length > 0) {
        const { error: hearingError } = await supabase
          .from('hearings')
          .update(hearingPatch)
          .eq('id', latest.id);
        if (hearingError) throw new AppError(hearingError.message, 500);
      }
    }
  }

  if (nextBench) {
    const before: BenchSnapshot = {
      judgePersonId: existing.judge_person_id ?? null,
      party1AdvocateId: existing.party1_advocate_id ?? null,
      party2AdvocateId: existing.party2_advocate_id ?? null,
      judgeName: existing.judge_name ?? '',
      party1Advocate: existing.party1_advocate ?? '',
      party2Advocate: existing.party2_advocate ?? '',
    };

    if (benchChanged(before, nextBench)) {
      await recordBenchHistory(id, nextBench);

      const { data: latest } = await supabase
        .from('hearings')
        .select('id')
        .eq('case_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latest) {
        const { error: hearingError } = await supabase
          .from('hearings')
          .update(hearingBenchFields(nextBench))
          .eq('id', latest.id);
        if (hearingError) throw new AppError(hearingError.message, 500);
      }
    }
  }

  return getCaseById(userId, id);
}

export async function addHearing(
  userId: string,
  caseInternalId: string,
  hearing: HearingInput
): Promise<CourtCaseDto> {
  const { data: existing, error: findError } = await supabase
    .from('cases')
    .select(
      'id, remarks, next_date, judge_name, party1_advocate, party2_advocate, judge_person_id, party1_advocate_id, party2_advocate_id'
    )
    .eq('id', caseInternalId)
    .eq('user_id', userId)
    .maybeSingle();

  if (findError) throw new AppError(findError.message, 500);
  if (!existing) throw new AppError('Case not found', 404);

  const bench: BenchSnapshot = {
    judgePersonId: existing.judge_person_id ?? null,
    party1AdvocateId: existing.party1_advocate_id ?? null,
    party2AdvocateId: existing.party2_advocate_id ?? null,
    judgeName: existing.judge_name ?? '',
    party1Advocate: existing.party1_advocate ?? '',
    party2Advocate: existing.party2_advocate ?? '',
  };

  const latest = await getLatestHearingRow(caseInternalId);

  if (latest && isHearingEditable(latest.created_at)) {
    const { error: hearingError } = await supabase
      .from('hearings')
      .update({
        date: hearing.date,
        proceeding: hearing.proceeding.trim(),
        adjournment_reason: hearing.adjournmentReason?.trim() ?? '',
        short_order: hearing.shortOrder?.trim() ?? '',
        remarks: hearing.remarks?.trim() || null,
        ...hearingBenchFields(bench),
      })
      .eq('id', latest.id);

    if (hearingError) throw new AppError(hearingError.message, 500);
  } else {
    if (latest && existing.next_date && localISODate(0) < existing.next_date) {
      throw new AppError('hearing.editLocked', 403);
    }

    const { error: hearingError } = await supabase.from('hearings').insert({
      case_id: caseInternalId,
      date: hearing.date,
      proceeding: hearing.proceeding.trim(),
      adjournment_reason: hearing.adjournmentReason?.trim() ?? '',
      short_order: hearing.shortOrder?.trim() ?? '',
      remarks: hearing.remarks?.trim() || null,
      ...hearingBenchFields(bench),
    });

    if (hearingError) throw new AppError(hearingError.message, 500);
  }

  const { error: updateError } = await supabase
    .from('cases')
    .update({
      next_date: hearing.date,
      proceeding: hearing.proceeding.trim(),
      remarks: hearing.remarks?.trim() || existing.remarks,
      status: 'pending',
      status_remarks: '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', caseInternalId);

  if (updateError) throw new AppError(updateError.message, 500);

  return getCaseById(userId, caseInternalId);
}

async function assertHearingOwnership(
  userId: string,
  caseInternalId: string,
  hearingId: string
): Promise<{ created_at: string }> {
  const { data: caseRow, error: caseError } = await supabase
    .from('cases')
    .select('id')
    .eq('id', caseInternalId)
    .eq('user_id', userId)
    .maybeSingle();

  if (caseError) throw new AppError(caseError.message, 500);
  if (!caseRow) throw new AppError('Case not found', 404);

  const { data: hearingRow, error: hearingError } = await supabase
    .from('hearings')
    .select('id, created_at')
    .eq('id', hearingId)
    .eq('case_id', caseInternalId)
    .maybeSingle();

  if (hearingError) throw new AppError(hearingError.message, 500);
  if (!hearingRow) throw new AppError('Hearing not found', 404);
  return { created_at: hearingRow.created_at };
}

export async function updateHearing(
  userId: string,
  caseInternalId: string,
  hearingId: string,
  patch: Partial<HearingInput>
): Promise<CourtCaseDto> {
  const owned = await assertHearingOwnership(userId, caseInternalId, hearingId);
  assertHearingEditable(owned.created_at);

  const updates: Record<string, unknown> = {};
  if (patch.date !== undefined) updates.date = patch.date;
  if (patch.proceeding !== undefined) updates.proceeding = patch.proceeding.trim();
  if (patch.adjournmentReason !== undefined) {
    updates.adjournment_reason = patch.adjournmentReason.trim();
  }
  if (patch.shortOrder !== undefined) {
    updates.short_order = patch.shortOrder.trim();
  }
  if (patch.remarks !== undefined) {
    updates.remarks = patch.remarks.trim() || null;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('hearings')
      .update(updates)
      .eq('id', hearingId);
    if (error) throw new AppError(error.message, 500);
  }

  await syncNextDateFromHearings(caseInternalId);

  return getCaseById(userId, caseInternalId);
}

export async function deleteHearing(
  userId: string,
  caseInternalId: string,
  hearingId: string
): Promise<CourtCaseDto> {
  const owned = await assertHearingOwnership(userId, caseInternalId, hearingId);
  assertHearingEditable(owned.created_at);

  const { error } = await supabase
    .from('hearings')
    .delete()
    .eq('id', hearingId);
  if (error) throw new AppError(error.message, 500);

  await syncNextDateFromHearings(caseInternalId);

  return getCaseById(userId, caseInternalId);
}

function isHearingOnDate(c: CourtCaseDto, isoDate: string): boolean {
  if (c.status === 'decided' || c.status === 'party_left') return false;
  return c.nextDate === isoDate;
}

function appearsOnCalendarDate(c: CourtCaseDto, isoDate: string): boolean {
  if (c.nextDate === isoDate) return true;
  return c.hearings.some((h) => h.date === isoDate);
}

export async function getByCategory(
  userId: string,
  category: CourtCategory
): Promise<CourtCaseDto[]> {
  const all = await listCases(userId);
  return all.filter((c) => c.category === category);
}

export async function getToday(userId: string): Promise<CourtCaseDto[]> {
  const today = localISODate(0);
  const all = await listCases(userId);
  return all.filter((c) => isHearingOnDate(c, today));
}

export async function getTomorrow(userId: string): Promise<CourtCaseDto[]> {
  const tomorrow = localISODate(1);
  const all = await listCases(userId);
  return all.filter((c) => isHearingOnDate(c, tomorrow));
}

export async function getByDate(
  userId: string,
  isoDate: string
): Promise<CourtCaseDto[]> {
  const all = await listCases(userId);
  return all.filter((c) => appearsOnCalendarDate(c, isoDate));
}

export async function getDatesWithHearings(userId: string): Promise<string[]> {
  const all = await listCases(userId);
  const set = new Set<string>();
  all.forEach((c) => {
    if (c.nextDate) set.add(c.nextDate);
    c.hearings.forEach((h) => {
      if (h.date) set.add(h.date);
    });
  });
  return Array.from(set).sort();
}

export async function searchCases(
  userId: string,
  query: string,
  mode: 'name' | 'caseId' | 'idCard'
): Promise<CourtCaseDto[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const all = await listCases(userId);
  return all.filter((c) => {
    if (mode === 'caseId') return c.caseId.toLowerCase().includes(q);
    if (mode === 'idCard') {
      return (
        c.party1.idCard.toLowerCase().includes(q) ||
        c.party2.idCard.toLowerCase().includes(q)
      );
    }
    return (
      c.party1.name.toLowerCase().includes(q) ||
      c.party2.name.toLowerCase().includes(q) ||
      c.client.name.toLowerCase().includes(q) ||
      c.judgeName.toLowerCase().includes(q)
    );
  });
}

export async function deleteCase(userId: string, id: string): Promise<void> {
  const { data, error } = await supabase
    .from('cases')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!data) throw new AppError('Case not found', 404);
}
