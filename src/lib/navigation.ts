import type {Section} from './session-validation';
export const publicNavigation=[{href:'/',label:'Home',icon:'home'},{href:'/events',label:'Events',icon:'calendar'}] as const;
export const administrationNavigation:{href:string;label:string;icon:string;section?:Section}[]=[
 {href:'/manage',label:'Overview',icon:'grid'},
 {href:'/manage/users',label:'Members',icon:'users',section:'users'},
 {href:'/manage/roles',label:'Roles & Permissions',icon:'shield',section:'roles'},
 {href:'/manage/activity',label:'Role Activity Log',icon:'history',section:'activity'},
 {href:'/manage/events',label:'Events',icon:'calendar',section:'events'},
];
export function routeLabel(path:string){
 if(path.startsWith('/manage/users/'))return 'Member details';
 return [...publicNavigation,...administrationNavigation,{href:'/account',label:'My account'},{href:'/account/security',label:'Account security'},{href:'/privacy',label:'Privacy Policy'},{href:'/login',label:'Login'},{href:'/register',label:'Create account'}].find(item=>item.href===path)?.label??'LAN Party';
}
