export type UserRole = 'employee' | 'manager' | 'hr';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  position: string;
  managerUid?: string;
  entryDate: string; // ISO date
  totalVacationDays: number;
  usedVacationDays: number;
  pendingVacationDays: number;
}

export type RequestStatus = 'pending_manager' | 'pending_hr' | 'approved' | 'rejected';
export type RequestType = 'vacation' | 'permission';

export interface VacationRequest {
  id: string;
  userUid: string;
  userName: string;
  managerUid?: string;
  type: RequestType;
  startDate: string;
  endDate: string;
  status: RequestStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
  managerApproverUid?: string;
  hrApproverUid?: string;
  managerApproverName?: string;
  hrApproverName?: string;
}
