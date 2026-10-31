import type {InputHTMLAttributes} from 'react';
import '../CSS/SwitchInput_style.css';
// Keep native form validation, FormData, labels, keyboard input and fieldset disabling.
export default function SwitchInput(props:Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'role'>){
 return <span className="ui-switch"><input {...props} type="checkbox" role="switch"/><span aria-hidden="true"/></span>;
}
