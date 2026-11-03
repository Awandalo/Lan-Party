import {emailTransport,authOrigin} from './auth/environment';
import type {AuthenticationEnvironment} from './auth/http';
// One claimed provider attempt per notification. Failures/uncertain outcomes are
// retained, never retried automatically, and cannot roll back registration.
export async function deliverRegistrationNotifications(request:Request,env:AuthenticationEnvironment,operationId:string){
 const rows=(await env.DB.prepare(`SELECT n.id,n.user_id,n.event_id,u.email FROM event_registration_notifications n JOIN users u ON u.id=n.user_id WHERE n.operation_id=? AND n.state='pending' AND u.status='active' AND u.email_verified_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM account_lifecycle WHERE user_id=u.id)`).bind(operationId).all<{id:string;user_id:string;event_id:string;email:string}>()).results;
 for(const row of rows){
  const claimed=await env.DB.prepare("UPDATE event_registration_notifications SET state='attempting' WHERE id=? AND state='pending' RETURNING id").bind(row.id).first();if(!claimed)continue;
  let state='failed';
  try{await emailTransport(request,env).send({purpose:'event-registration',to:row.email,url:authOrigin(request,env).origin+'/events/'+row.event_id,expiresAt:Math.floor(Date.now()/1000)+604800,idempotencyKey:row.id});state='sent';}catch{/* Keep sanitized failure state; no provider/recipient data in logs. */}
  await env.DB.prepare("UPDATE event_registration_notifications SET state=? WHERE id=? AND state='attempting'").bind(state,row.id).run();
 }
}
export async function deliverPendingRegistrationNotifications(env:AuthenticationEnvironment){
 const operations=(await env.DB.prepare("SELECT operation_id FROM event_registration_notifications WHERE state='pending' GROUP BY operation_id ORDER BY min(created_at),operation_id LIMIT 10").all<{operation_id:string}>()).results;
 const request=new Request(env.AUTH_PUBLIC_ORIGIN??'https://invalid.example.test');
 for(const row of operations)await deliverRegistrationNotifications(request,env,row.operation_id);
}
