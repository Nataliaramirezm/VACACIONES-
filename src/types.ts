export type UserRole = 'employee' | 'manager' | 'hr' | 'gerencia';

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
  manualVacationPeriod?: string;
}

export type RequestStatus = 'pending_manager' | 'pending_gerencia' | 'pending_replacement' | 'pending_hr' | 'approved' | 'rejected' | 'cancelled';
export type RequestType = 'vacation' | 'permission';

export interface VacationRequest {
  id: string;
  userUid: string;
  userName: string;
  managerUid?: string;
  replacementUid?: string;
  replacementName?: string;
  type: RequestType;
  startDate: string;
  endDate: string;
  status: RequestStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
  managerApproverUid?: string;
  gerenciaApproverUid?: string;
  hrApproverUid?: string;
  replacementApproverUid?: string;
  managerApproverName?: string;
  gerenciaApproverName?: string;
  hrApproverName?: string;
  replacementApproverName?: string;
  cancellationReason?: string;
  cancelledAt?: string;
}
