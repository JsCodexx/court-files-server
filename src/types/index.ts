export type CourtCategory =
  | 'Civil Courts'
  | 'Session Courts'
  | 'High Courts'
  | 'Supreme Courts'
  | 'Family Courts'
  | 'Magisterial Courts'
  | 'Others';
export type AdvocateFor = 'Party 1' | 'Party 2';
export type CaseStatus = 'pending' | 'decided' | 'party_left';

export interface ClientInfo {
  name: string;
  address: string;
  phone: string;
}

export interface PartyInfo {
  name: string;
  idCard: string;
  phone: string;
}

export type PersonRole = 'judge' | 'advocate';

export interface CasePersonDto {
  id: string;
  name: string;
  role: PersonRole;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface BenchHistoryRecord {
  id: string;
  judgePersonId: string | null;
  party1AdvocateId: string | null;
  party2AdvocateId: string | null;
  judgeName: string;
  party1Advocate: string;
  party2Advocate: string;
  effectiveFrom: string;
  createdAt: string;
}

export interface HearingRecord {
  id: string;
  date: string;
  proceeding: string;
  adjournmentReason?: string;
  shortOrder?: string;
  remarks?: string;
  judgeName: string;
  party1Advocate: string;
  party2Advocate: string;
  judgePersonId: string | null;
  party1AdvocateId: string | null;
  party2AdvocateId: string | null;
  createdAt: string;
}

export interface CourtCaseDto {
  id: string;
  caseId: string;
  category: CourtCategory;
  party1: PartyInfo;
  party2: PartyInfo;
  courtNumber?: string;
  city: string;
  judgeName: string;
  advocateFor: AdvocateFor;
  party1Advocate: string;
  party2Advocate: string;
  judgePersonId: string | null;
  party1AdvocateId: string | null;
  party2AdvocateId: string | null;
  nextDate: string;
  proceeding: string;
  remarks: string;
  status: CaseStatus;
  statusRemarks: string;
  client: ClientInfo;
  hearings: HearingRecord[];
  benchHistory?: BenchHistoryRecord[];
  createdAt: string;
  updatedAt: string;
  userId: string;
}

export interface AuthSession {
  userId: string;
  email: string;
  name: string;
}

export interface AuthUserResponse extends AuthSession {
  phone: string;
  barAddress: string;
}
