export type CourtCategory =
  | 'Civil Courts'
  | 'Session Courts'
  | 'High Courts'
  | 'Supreme Courts'
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

export interface HearingRecord {
  id: string;
  date: string;
  proceeding: string;
  adjournmentReason?: string;
  shortOrder?: string;
  remarks?: string;
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
  opponentCounsel: string;
  nextDate: string;
  proceeding: string;
  remarks: string;
  status: CaseStatus;
  statusRemarks: string;
  client: ClientInfo;
  hearings: HearingRecord[];
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
