import { Case, Hearing } from '../db/schema';
import {
  BenchHistoryRecord,
  CaseStatus,
  CourtCaseDto,
  HearingRecord,
} from '../types';

function toIsoDate(value: string | Date): string {
  if (typeof value === 'string') {
    return value.slice(0, 10);
  }
  return value.toISOString().slice(0, 10);
}

function toIsoDateTime(value: string | Date): string {
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function normalizeStatus(value: string | null | undefined): CaseStatus {
  if (value === 'decided' || value === 'party_left') return value;
  return 'pending';
}

export function mapHearing(row: Hearing): HearingRecord {
  return {
    id: row.id,
    date: toIsoDate(row.date),
    proceeding: row.proceeding,
    adjournmentReason: row.adjournmentReason || undefined,
    shortOrder: row.shortOrder || undefined,
    remarks: row.remarks ?? undefined,
    judgeName: row.judgeName ?? '',
    party1Advocate: row.party1Advocate ?? '',
    party2Advocate: row.party2Advocate ?? '',
    judgePersonId: row.judgePersonId ?? null,
    party1AdvocateId: row.party1AdvocateId ?? null,
    party2AdvocateId: row.party2AdvocateId ?? null,
    createdAt: toIsoDateTime(row.createdAt),
  };
}

export function mapBenchHistory(row: {
  id: string;
  judgePersonId: string | null;
  party1AdvocateId: string | null;
  party2AdvocateId: string | null;
  judgeName: string;
  party1Advocate: string;
  party2Advocate: string;
  effectiveFrom: string | Date;
  createdAt: string | Date;
}): BenchHistoryRecord {
  return {
    id: row.id,
    judgePersonId: row.judgePersonId,
    party1AdvocateId: row.party1AdvocateId,
    party2AdvocateId: row.party2AdvocateId,
    judgeName: row.judgeName ?? '',
    party1Advocate: row.party1Advocate ?? '',
    party2Advocate: row.party2Advocate ?? '',
    effectiveFrom: toIsoDateTime(row.effectiveFrom),
    createdAt: toIsoDateTime(row.createdAt),
  };
}

export function mapCase(
  row: Case,
  hearingRows: Hearing[],
  benchHistory: BenchHistoryRecord[] = []
): CourtCaseDto {
  const hearings = hearingRows
    .map(mapHearing)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

  const sortedBench = [...benchHistory].sort(
    (a, b) =>
      new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
  );

  return {
    id: row.id,
    caseId: row.caseId,
    category: row.category as CourtCaseDto['category'],
    party1: {
      name: row.party1Name,
      idCard: row.party1IdCard,
      phone: row.party1Phone,
    },
    party2: {
      name: row.party2Name,
      idCard: row.party2IdCard,
      phone: row.party2Phone,
    },
    courtNumber: row.courtNumber ?? undefined,
    city: row.city ?? '',
    judgeName: row.judgeName,
    advocateFor: row.advocateFor as CourtCaseDto['advocateFor'],
    party1Advocate: row.party1Advocate ?? '',
    party2Advocate: row.party2Advocate ?? '',
    judgePersonId: row.judgePersonId ?? null,
    party1AdvocateId: row.party1AdvocateId ?? null,
    party2AdvocateId: row.party2AdvocateId ?? null,
    nextDate: toIsoDate(row.nextDate),
    proceeding: row.proceeding,
    remarks: row.remarks,
    status: normalizeStatus(row.status),
    statusRemarks: row.statusRemarks ?? '',
    client: {
      name: row.clientName,
      address: row.clientAddress,
      phone: row.clientPhone,
    },
    hearings,
    benchHistory: sortedBench,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
    userId: row.userId,
  };
}
