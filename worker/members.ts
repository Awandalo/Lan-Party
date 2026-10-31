import {userActivityReady} from './auth/user-activity';
// Read-only projections: never join authentication tables or expose SELECT *.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const memberNumber = (value: string) => /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const joins = `FROM users u JOIN member_numbers m ON m.user_id=u.id AND m.registered=1
 LEFT JOIN user_nicknames n ON n.user_id=u.id LEFT JOIN account_lifecycle l ON l.user_id=u.id`;
const memberColumns = `u.id AS userId,n.nickname,CAST(m.member_number AS TEXT) AS memberNumber,
 CASE WHEN l.state='deleting' THEN 'deleting' WHEN u.status='disabled' AND l.state='deactivated'
 THEN 'deactivated' WHEN u.status='disabled' THEN 'disabled' ELSE 'active' END AS status`;
interface Member {userId: string; nickname: string | null; memberNumber: string; status: string}
class InvalidQuery extends Error {}
function invalid(): never {throw new InvalidQuery();}
async function roles(db: D1Database, ids: string[]) {
 if (!ids.length) return [];
 return (await db.prepare(`SELECT ur.user_id AS userId,r.code,r.name,r.is_active AS active
 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id IN (${ids.map(()=>'?').join(',')})
 ORDER BY r.name,r.id`).bind(...ids).all<{userId:string;code:string;name:string;active:number}>()).results;
}
export async function memberRead(db: D1Database, url: URL): Promise<{status: number; body: object}> {
 try {
  const audited=await userActivityReady(db);
  const columns=audited?memberColumns.replace("THEN 'deactivated'","THEN CASE WHEN l.origin='administrator' THEN 'admin-disabled' ELSE 'deactivated' END"):memberColumns;
  const id = url.pathname.slice('/api/manage/users'.length).replace(/^\//,'');
  if (id) {
   if (!uuid.test(id) || url.search) invalid();
   const row = await db.prepare(`SELECT ${columns},u.email,u.email_verified_at IS NOT NULL AS verified,
    CASE WHEN l.state IS NULL ${audited?"OR l.origin='administrator'":''} THEN u.first_name ELSE NULL END AS firstName,
    CASE WHEN l.state IS NULL ${audited?"OR l.origin='administrator'":''} THEN u.last_name ELSE NULL END AS lastName,
    CASE WHEN l.state IS NULL ${audited?"OR l.origin='administrator'":''} THEN p.label ELSE NULL END AS prefix,u.created_at AS createdAt
    ${joins} LEFT JOIN name_prefixes p ON p.id=u.name_prefix_id WHERE u.id=?`).bind(id).first<Member & {verified:number}>();
   if (!row) return {status:404,body:{error:'Member not found'}};
   const assignments=await roles(db,[id]);
   return {status:200,body:{member:{...row,verified:row.verified===1,roles:assignments.map(({code,name,active})=>({code,name,active:active===1}))}}};
  }
  const params=url.searchParams;
  for (const key of params.keys()) if (!['status','search','limit','cursor','roleId'].includes(key) || params.getAll(key).length!==1) invalid();
  const roleId=params.get('roleId')??'';
  if(params.has('roleId')&&!uuid.test(roleId))invalid();
  const status=params.get('status')??'active';
  if (!['active','deactivated','disabled'].includes(status)&&!(status==='all'&&roleId)) invalid();
  const raw=params.get('search')??'';
  if (raw.length>128 || /[\u0000-\u001f\u007f]/.test(raw)) invalid();
  const search=raw.trim().normalize('NFC').toLowerCase();
  if (Array.from(search).length>24) invalid();
  const numeric=/^#?[0-9]{1,24}$/.test(search)?search.replace(/^#/,'').replace(/^0+(?=\d)/,''):'';
  // Out-of-range numeric input can still match a nickname; never cast it to a
  // SQLite integer (which would clamp) or a JavaScript Number (which rounds).
  const number=memberNumber(numeric)?numeric:null;
  const size=params.get('limit')??'20'; if (!/^[1-9][0-9]?$/.test(size) || Number(size)>50) invalid();
  const limit=Number(size);
  const criteria=roleId?{version:3,status,search,limit,roleId}:{version:2,status,search,limit};
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(criteria)));
  const hash=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
  let afterNumber='0',afterId='';
  const cursor=params.get('cursor');
  if (cursor!==null) {
   if (cursor.length>140) invalid();
   const parts=cursor.split('.');
   if (parts.length!==4 || parts[0]!=='v1' || parts[1]!==hash || !memberNumber(parts[2]) || !uuid.test(parts[3])) invalid();
   [, ,afterNumber,afterId]=parts;
  }
  const filter=status==='all'?'1':status==='active'?"u.status='active' AND l.state IS NULL":status==='deactivated'?"u.status='disabled' AND l.state='deactivated'":"u.status='disabled' AND (l.state IS NULL OR l.state<>'deactivated')";
  const searchSql=!search?'1':"(n.nickname_key LIKE ? ESCAPE '\\' OR m.member_number=CAST(? AS INTEGER))";
  const term='%'+search.replace(/[\\%_]/g,'\\$&')+'%';
  const rows=await db.prepare(`SELECT ${columns} ${joins} WHERE ${filter} AND ${searchSql}
    ${roleId?'AND EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.role_id=?)':''}
    AND (m.member_number>CAST(? AS INTEGER) OR (m.member_number=CAST(? AS INTEGER) AND u.id>?))
    ORDER BY m.member_number,u.id LIMIT ?`).bind(...(search?[term,number]:[]),...(roleId?[roleId]:[]),afterNumber,afterNumber,afterId,limit+1).all<Member>();
  const page=rows.results.slice(0,limit),assignments=await roles(db,page.map(row=>row.userId));
  const last=page.at(-1);
  return {status:200,body:{members:page.map(row=>({...row,roles:assignments.filter(r=>r.userId===row.userId).map(({code,name,active})=>({code,name,active:active===1}))})),
   nextCursor:rows.results.length>limit && last?`v1.${hash}.${last.memberNumber}.${last.userId}`:null}};
 } catch (error) {
  if (error instanceof InvalidQuery) return {status:400,body:{error:'Invalid member query'}};
  throw error;
 }
}
