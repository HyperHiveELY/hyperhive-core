import {uiText} from "../i18n/language.js";
import React,{useState} from 'react';
import {Eye,EyeOff} from '../ui/ProductIcons.js';
export function PasswordInput(props:Omit<React.InputHTMLAttributes<HTMLInputElement>,'type'>){
 const [visible,setVisible]=useState(false);
 return <span className="field-with-action"><input {...props} type={visible?'text':'password'}/><button type="button" aria-label={visible?uiText("Hide password"):uiText("Show password")} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={16}/>:<Eye size={16}/>}</button></span>;
}
