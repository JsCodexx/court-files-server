import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import * as personsService from './personsService';
import { PersonRole } from '../types';

export interface BenchSnapshot {
  judgePersonId: string | null;
  party1AdvocateId: string | null;
  party2AdvocateId: string | null;
  judgeName: string;
  party1Advocate: string;
  party2Advocate: string;
}

export async function resolveBench(
  userId: string,
  input: {
    judgePersonId?: string | null;
    party1AdvocateId?: string | null;
    party2AdvocateId?: string | null;
    judgeName?: string;
    party1Advocate?: string;
    party2Advocate?: string;
  }
): Promise<BenchSnapshot> {
  const judge = await personsService.resolvePerson(userId, 'judge', {
    personId: input.judgePersonId,
    name: input.judgeName,
  });
  if (!judge.name) {
    throw new AppError('Judge name is required', 400);
  }

  const p1 = await personsService.resolvePerson(userId, 'advocate', {
    personId: input.party1AdvocateId,
    name: input.party1Advocate,
  });
  const p2 = await personsService.resolvePerson(userId, 'advocate', {
    personId: input.party2AdvocateId,
    name: input.party2Advocate,
  });

  return {
    judgePersonId: judge.id,
    party1AdvocateId: p1.id,
    party2AdvocateId: p2.id,
    judgeName: judge.name,
    party1Advocate: p1.name,
    party2Advocate: p2.name,
  };
}

export async function recordBenchHistory(
  caseInternalId: string,
  bench: BenchSnapshot,
  effectiveFrom?: string
): Promise<void> {
  const { error } = await supabase.from('case_bench_history').insert({
    case_id: caseInternalId,
    judge_person_id: bench.judgePersonId,
    party1_advocate_id: bench.party1AdvocateId,
    party2_advocate_id: bench.party2AdvocateId,
    judge_name: bench.judgeName,
    party1_advocate: bench.party1Advocate,
    party2_advocate: bench.party2Advocate,
    effective_from: effectiveFrom ?? new Date().toISOString(),
  });
  if (error) throw new AppError(error.message, 500);
}

export function benchChanged(
  before: Partial<BenchSnapshot>,
  after: BenchSnapshot
): boolean {
  return (
    (before.judgePersonId ?? null) !== after.judgePersonId ||
    (before.party1AdvocateId ?? null) !== after.party1AdvocateId ||
    (before.party2AdvocateId ?? null) !== after.party2AdvocateId ||
    (before.judgeName ?? '') !== after.judgeName ||
    (before.party1Advocate ?? '') !== after.party1Advocate ||
    (before.party2Advocate ?? '') !== after.party2Advocate
  );
}

export function hearingBenchFields(bench: BenchSnapshot) {
  return {
    judge_name: bench.judgeName,
    party1_advocate: bench.party1Advocate,
    party2_advocate: bench.party2Advocate,
    judge_person_id: bench.judgePersonId,
    party1_advocate_id: bench.party1AdvocateId,
    party2_advocate_id: bench.party2AdvocateId,
  };
}

export type { PersonRole };
