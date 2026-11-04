import React from 'react';
import {House,Layers,Wallet,Activity,Settings,FileText,Plus,ArrowRight,Pause,Play,LayoutGrid,List,Box,Triangle,Diamond,Search,ShieldCheck,Sparkles,Copy,BrandMark} from '../ui/ProductIcons.js';
const icons:Record<string,typeof House>={overview:House,bots:Layers,wallet:Wallet,activity:Activity,settings:Settings,records:FileText,plus:Plus,arrow:ArrowRight,pause:Pause,play:Play,grid:LayoutGrid,list:List,cube:Box,triangle:Triangle,diamond:Diamond,search:Search,shield:ShieldCheck,spark:Sparkles,copy:Copy};
export function Icon({name,size=18}:{name:string;size?:number}){const Glyph=icons[name]??Layers;return <Glyph size={size}/>;}
export function HiveMark(){return <BrandMark className="hive-mark"/>;}
