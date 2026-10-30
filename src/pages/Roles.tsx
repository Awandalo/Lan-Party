import RoleWorkspace,{RoleWorkspaceLoading} from '../components/RoleWorkspace';
import RoleActivityLog from '../components/RoleActivityLog';
import '../CSS/Roles_style.css';
export function RolesLoading(){return <RoleWorkspaceLoading/>;}
export default function Roles(){return <RoleWorkspace/>;}
export function RoleActivity(){return <RoleActivityLog/>;}
