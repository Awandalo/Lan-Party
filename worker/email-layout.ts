// Shared, self-contained transactional email shell. Callers escape their content.
export function escapeEmailHtml(value:string){
 return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}
export function brandedEmailHtml(subject:string,heading:string,contentHtml:string,footerHtml:string){
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeEmailHtml(subject)}</title></head>
<body style="margin:0;padding:0;background-color:#101317;color:#edf1f5;font-family:'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#101317;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#171c22;border:1px solid #333d49;border-radius:12px;"><tr><td style="padding:32px 24px;">
<p style="margin:0 0 24px;color:#8de2bd;font-size:18px;font-weight:bold;letter-spacing:1px;">LAN / PARTY</p>
<h1 style="margin:0 0 16px;color:#edf1f5;font-size:28px;line-height:1.25;">${escapeEmailHtml(heading)}</h1>
${contentHtml}
<p style="margin:0;padding-top:20px;border-top:1px solid #333d49;color:#aeb9c7;font-size:13px;line-height:1.6;">${footerHtml}</p>
</td></tr></table></td></tr></table></body></html>`;
}
