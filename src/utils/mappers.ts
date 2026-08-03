import { Case, Hearing } from '../db/schema';
import { CaseStatus, CourtCaseDto, HearingRecord } from '../types';

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
    createdAt: toIsoDateTime(row.createdAt),
  };
}

export function mapCase(row: Case, hearingRows: Hearing[]): CourtCaseDto {
  const hearings = hearingRows
    .map(mapHearing)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
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
    opponentCounsel: row.opponentCounsel,
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
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
    userId: row.userId,
  };
}
