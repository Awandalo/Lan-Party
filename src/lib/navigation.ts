import type {Section} from './session-validation';
export const publicNavigation=[{href:'/',label:'Home',icon:'home'},{href:'/events',label:'Events',icon:'calendar'}] as const;
export const administrationNavigation:{href:string;label:string;icon:string;section?:Section}[]=[
 {href:'/manage',label:'Overview',icon:'grid'},
 {href:'/manage/events',label:'Events',icon:'calendar',section:'events'},
 {href:'/manage/users',label:'Members',icon:'users',section:'users'},
 {href:'/manage/roles',label:'Roles & Permissions',icon:'shield',section:'roles'},
 {href:'/manage/feedback',label:'Feedback',icon:'bug',section:'feedback'},
 {href:'/manage/logs',label:'Logs',icon:'history',section:'activity'},
];
export const accountNavigation=[{href:'/account',label:'My account',icon:'users'},{href:'/account/security',label:'Account Security',icon:'lock'}];
export function mainArea(path:string){return /^\/manage(?:\/|$)/.test(path)?'administration':/^\/account(?:\/|$)/.test(path)?'account':null;}
export function isLogs(path:string){return ['/manage/logs','/manage/activity','/manage/user-activity'].includes(path);}
export function contextualNavigation(path:string,sections:Section[],signedIn:boolean){
 if(!signedIn)return [];
 if(mainArea(path)==='account')return signedIn?accountNavigation:[];
 if(mainArea(path)!=='administration'||!sections.length)return [];
 return administrationNavigation.filter(item=>!item.section||sections.includes(item.section)||item.href==='/manage/logs'&&sections.includes('userActivity'));
}
export function routeLabel(path:string){
 if(path.startsWith('/account/feedback'))return 'Feedback';
 if(path.startsWith('/manage/feedback'))return 'Feedback';
 if(path==='/reactivate')return 'Reactivate account';
 if(path.startsWith('/manage/users/'))return 'Member details';
 if(path==='/manage/activity')return 'Role Activity Log';
 if(path==='/manage/user-activity')return 'User Log';
 return [...publicNavigation,...administrationNavigation,{href:'/account',label:'My account'},{href:'/account/security',label:'Account security'},{href:'/privacy',label:'Privacy Policy'},{href:'/login',label:'Login'},{href:'/register',label:'Create account'}].find(item=>item.href===path)?.label??'LAN Party';
}
