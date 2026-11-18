import type {AchievementCode} from './achievements';
export interface MemberRole {code: string; name: string; active: boolean}
export interface MemberSummary {userId: string; nickname: string | null; memberNumber: string; status: 'active' | 'deactivated' | 'admin-disabled' | 'disabled' | 'deleting'; roles: MemberRole[]}
export interface MemberAttendanceEvent {id:string;title:string;venue:string|null;days:string[];achievementsEnabled:boolean}
export interface MemberAttendanceHistory {available:boolean;events:MemberAttendanceEvent[];hasMore:boolean}
export interface MemberAchievementTitle {available:boolean;code:AchievementCode|null}
export interface MemberDetail extends MemberSummary {email: string; firstName: string | null; lastName: string | null; prefix: string | null; verified: boolean; createdAt: number;attendance:MemberAttendanceHistory;achievementTitle:MemberAchievementTitle}
export interface MemberPage {members: MemberSummary[]; nextCursor: string | null}
