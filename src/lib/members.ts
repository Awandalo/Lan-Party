export interface MemberRole {code: string; name: string; active: boolean}
export interface MemberSummary {userId: string; nickname: string | null; memberNumber: string; status: 'active' | 'deactivated' | 'disabled' | 'deleting'; roles: MemberRole[]}
export interface MemberDetail extends MemberSummary {email: string; firstName: string | null; lastName: string | null; prefix: string | null; verified: boolean; createdAt: number}
export interface MemberPage {members: MemberSummary[]; nextCursor: string | null}
