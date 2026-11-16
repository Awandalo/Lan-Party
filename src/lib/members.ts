export interface MemberRole {code: string; name: string; active: boolean}
export interface MemberSummary {userId: string; nickname: string | null; memberNumber: string; status: 'active' | 'deactivated' | 'admin-disabled' | 'disabled' | 'deleting'; roles: MemberRole[]}
export interface MemberAttendanceEvent {id:string;title:string;venue:string|null;days:string[];achievementsEnabled:boolean}
export interface MemberAttendanceHistory {available:boolean;events:MemberAttendanceEvent[];hasMore:boolean}
export interface MemberDetail extends MemberSummary {email: string; firstName: string | null; lastName: string | null; prefix: string | null; verified: boolean; createdAt: number;attendance:MemberAttendanceHistory}
export interface MemberPage {members: MemberSummary[]; nextCursor: string | null}
