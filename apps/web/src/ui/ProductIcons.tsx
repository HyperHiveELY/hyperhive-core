import React,{forwardRef,type SVGProps} from 'react';
import './product-icons.css';

/** HyperHive's geometric icon family. 24-unit grid, square terminals, faceted
 * silhouettes and restrained solid planes, derived from the landing-page art.
 * Icons inherit control color; accessible names belong to the controls. */
export type IconProps=SVGProps<SVGSVGElement>&{size?:number|string};
const plane=(d:string)=><path d={d} fill="currentColor" fillOpacity=".2" stroke="none"/>;
const solid=(d:string)=><path d={d} fill="currentColor" stroke="none"/>;
function icon(name:string,shapes:React.ReactNode){
 const Component=forwardRef<SVGSVGElement,IconProps>(({size=20,className='',children,...props},ref)=><svg ref={ref} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false" className={'hh-icon hh-icon-'+name+' '+className} {...props}>{shapes}{children}</svg>);
 Component.displayName=name;return Component;
}
export const ArrowRight=icon('arrow-right',<path d="M3 12h17M14 5l7 7-7 7"/>);
export const ArrowLeft=icon('arrow-left',<path d="M21 12H4m6-7-7 7 7 7"/>);
export const ArrowUpRight=icon('arrow-up-right',<path d="M5 19 19 5M7 5h12v12"/>);
export const ChevronRight=icon('chevron-right',<path d="m9 5 7 7-7 7"/>);
export const ChevronLeft=icon('chevron-left',<path d="m15 5-7 7 7 7"/>);
export const ChevronDown=icon('chevron-down',<path d="m5 9 7 7 7-7"/>);
export const Plus=icon('plus',<path d="M12 4v16M4 12h16"/>);
export const Minus=icon('minus',<path d="M4 12h16"/>);
export const X=icon('close',<path d="m5 5 14 14M19 5 5 19"/>);
export const Check=icon('check',solid('m3 12 2-2 5 5L19 5l2 2L10 19Z'));
export const Pause=icon('pause',solid('M5 4h5v16H5ZM14 4h5v16h-5Z'));
export const Play=icon('play',solid('m6 3 15 9-15 9Z'));
export const Search=icon('search',<><path d="m7 3-4 4v6l4 4h6l4-4V7l-4-4ZM16 16l5 5"/>{plane('M7 3h6l4 4H3Z')}</>);
export const Wallet=icon('wallet',<>{plane('M3 8h18v12H3Z')}<path d="M4 8V5l13-3v6M3 8h18v12H3ZM21 12h-7v4h7"/>{solid('M16 13h2v2h-2Z')}</>);
export const Copy=icon('copy',<>{plane('M8 8h13v13H8Z')}<path d="M8 8h13v13H8ZM4 16H3V3h13v1"/></>);
export const Download=icon('download',<><path d="M12 2v13m-5-5 5 5 5-5M3 17v4h18v-4"/>{solid('M3 19h18v2H3Z')}</>);
export const ArrowDownToLine=icon('deposit',<><path d="M12 3v13m-6-6 6 6 6-6M3 21h18"/>{plane('M7 4h10v8H7Z')}</>);
export const ArrowUpFromLine=icon('withdraw',<><path d="M12 17V4m-6 6 6-6 6 6M3 21h18"/>{plane('M7 12h10v6H7Z')}</>);
export const LockKeyhole=icon('lock',<>{plane('M4 10h16v11H4Z')}<path d="M4 10h16v11H4ZM7 10V5l2-2h6l2 2v5M12 14v3"/></>);
export const KeyRound=icon('key',<>{plane('m7 3 5 3v6l-5 3-5-3V6Z')}<path d="m7 3 5 3v6l-5 3-5-3V6ZM12 12l9 9M16 16l3-3M19 19l3-3"/>{solid('M5 7h3v3H5Z')}</>);
export const ShieldCheck=icon('shield-check',<>{plane('M3 4h18v9l-9 9-9-9Z')}<path d="M3 4h18v9l-9 9-9-9Z"/>{solid('m6 11 2-2 3 3 5-6 2 2-7 8Z')}</>);
export const Ban=icon('ban',<><path d="m8 2-6 6v8l6 6h8l6-6V8l-6-6ZM5 5l14 14"/>{plane('M8 2h8l6 6H2Z')}</>);
export const RefreshCw=icon('refresh',<><path d="M20 9V3m0 6h-6M4 15v6m0-6h6M4 9l3-5h9l4 5M20 15l-3 5H8l-4-5"/></>);
export const UserRound=icon('profile',<>{plane('m12 2 4 2v5l-4 2-4-2V4Z')}<path d="m12 2 4 2v5l-4 2-4-2V4ZM3 21v-4l5-3h8l5 3v4"/></>);
export const LogOut=icon('logout',<><path d="M10 3H3v18h7M9 12h12m-5-5 5 5-5 5"/>{plane('M3 3h4v18H3Z')}</>);
export const House=icon('home',<>{plane('m3 10 9-8 9 8Z')}<path d="m3 10 9-8 9 8v11h-7v-7h-4v7H3Z"/></>);
export const Layers=icon('layers',<>{solid('m12 2 10 5-10 5L2 7Z')}<path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>);
export const Box=icon('box',<>{plane('m12 2 9 5-9 5-9-5ZM12 12l9-5v10l-9 5Z')}<path d="m12 2 9 5v10l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v10"/></>);
export const LayoutGrid=icon('grid',<>{solid('M3 3h7v7H3ZM14 14h7v7h-7Z')}<path d="M15 3h6v6h-6ZM3 15h6v6H3Z"/></>);
export const List=icon('list',<>{solid('M2 3h4v4H2ZM2 10h4v4H2ZM2 17h4v4H2Z')}<path d="M10 5h11M10 12h11M10 19h11"/></>);
export const Menu=icon('menu',<path d="M3 5h18M3 12h18M3 19h18"/>);
export const FileText=icon('record',<>{plane('M4 2h10l6 6H4Z')}<path d="M4 2h10l6 6v14H4ZM14 2v6h6M8 12h8M8 17h5"/></>);
export const FileCheck2=icon('record-check',<>{plane('M4 2h10l6 6H4Z')}<path d="M4 2h10l6 6v14H4ZM14 2v6h6m-12 7 3 3 5-6"/></>);
export const Coins=icon('tokens',<>{plane('m9 2 7 4v8l-7 4-7-4V6Z')}<path d="m9 2 7 4v8l-7 4-7-4V6ZM16 7l6 3v8l-7 4-5-3M9 6v8"/></>);
export const CandlestickChart=icon('trading',<>{plane('M7 5h4v7H7ZM15 12h4v6h-4Z')}<path d="M3 2v20h19M9 3v2m0 7v5M7 5h4v7H7ZM17 7v5m0 6v3M15 12h4v6h-4Z"/></>);
export const Activity=icon('activity',<><path d="M2 13h4l3-9 6 16 3-7h4"/>{solid('M1 12h3v3H1ZM20 12h3v3h-3Z')}</>);
export const Sparkles=icon('signal',<>{solid('m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z')}{plane('M2 2h4v4H2ZM18 18h4v4h-4Z')}</>);
export const Settings=icon('settings',<>{plane('m9 2 6 0 1 4 4 1 2 5-2 5-4 1-1 4H9l-1-4-4-1-2-5 2-5 4-1Z')}<path d="M9 2h6l1 4 4 1 2 5-2 5-4 1-1 4H9l-1-4-4-1-2-5 2-5 4-1ZM9 9h6v6H9Z"/></>);
export const Settings2=icon('controls',<><path d="M2 6h7m6 0h7M2 18h7m6 0h7"/>{solid('M9 2h6v8H9ZM9 14h6v8H9Z')}</>);
export const Link=icon('link',<><path d="m9 7 4-4h5l3 3v5l-4 4M7 9l-4 4v5l3 3h5l4-4M8 16l8-8"/></>);
export const ExternalLink=icon('external-link',<><path d="M10 4H3v17h17v-7M14 3h7v7M10 14 21 3"/></>);
export const Cloud=icon('cloud',<>{plane('M2 12 5 8h3l3-5h5l3 5 3 3v8H2Z')}<path d="M2 12 5 8h3l3-5h5l3 5 3 3v8H2Z"/></>);
export const Monitor=icon('monitor',<>{plane('M3 3h18v12H3Z')}<path d="M2 3h20v13H2ZM12 16v5M7 21h10"/></>);
export const Globe=icon('globe',<><path d="m8 2-6 6v8l6 6h8l6-6V8l-6-6ZM12 2v20M2 12h20M8 3l-2 9 2 9M16 3l2 9-2 9"/></>);
export const Command=icon('command',<><path d="M8 8H3V3h5v18H3v-5h18v5h-5V3h5v5Z"/></>);
export const Crosshair=icon('crosshair',<><path d="M12 2v4m0 12v4M2 12h4m12 0h4M6 6h12v12H6Z"/>{solid('M10 10h4v4h-4Z')}</>);
export const ScanLine=icon('scan',<><path d="M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M2 12h20"/>{plane('M6 6h12v12H6Z')}</>);
export const Radio=icon('radio',<><path d="m7 4-4 4v8l4 4m10-16 4 4v8l-4 4M8 8l-2 2v4l2 2m8-8 2 2v4l-2 2"/>{solid('M10 10h4v4h-4Z')}</>);
export const Eye=icon('eye',<><path d="m2 12 6-7h8l6 7-6 7H8Z"/>{solid('M9 9h6v6H9Z')}</>);
export const EyeOff=icon('eye-off',<><path d="m2 12 6-7h8l6 7-6 7H8ZM3 3l18 18"/>{plane('M9 9h6v6H9Z')}</>);
export const Send=icon('send',<>{plane('M3 3 22 12 3 21l4-9Z')}<path d="M3 3 22 12 3 21l4-9ZM7 12h15"/></>);
export const Slash=icon('line',<path d="M4 20 20 4"/>);
export const Square=icon('rectangle',<path d="M3 3h18v18H3Z"/>);
export const MoveHorizontal=icon('horizontal',<path d="M2 12h20M6 8l-4 4 4 4m12-8 4 4-4 4"/>);
export const Type=icon('text',<path d="M3 7V3h18v4M12 3v18M8 21h8"/>);
export const Camera=icon('camera',<>{plane('M2 7h20v14H2Z')}<path d="M2 7h5l2-4h6l2 4h5v14H2ZM9 10l-2 2v3l2 2h6l2-2v-3l-2-2Z"/></>);
export const Expand=icon('expand',<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>);
export const Undo2=icon('undo',<path d="m8 3-6 6 6 6M2 9h14l5 5v6h-9"/>);
export const Trash2=icon('delete',<>{plane('M6 7h12v14H6Z')}<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>);
export const Circle=icon('pending',<path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z"/>);
export const Diamond=icon('diamond',<>{plane('m12 2 10 10-10 10Z')}<path d="m12 2 10 10-10 10L2 12Z"/></>);
export const Triangle=icon('triangle',<>{plane('m12 3 9 18-9-5Z')}<path d="m12 3 9 18H3ZM12 3v13l9 5M12 16l-9 5"/></>);

// Crew identities are architectural forms, never token/network lookalikes.
export const CrewStack=icon('crew-stack',<>{plane('m12 2 9 5-9 5-9-5ZM12 12l9-5v10l-9 5Z')}<path d="m12 2 9 5v10l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v10m-5-17 9 5"/></>);
export const CrewLattice=icon('crew-lattice',<>{plane('m12 2 9 5v10l-9 5V12L3 7Z')}<path d="m12 2 9 5v10l-9 5-9-5V7ZM3 7l9 5 9-5M12 12v10M12 2v5l-9 5m18 0-9 5-9-5"/></>);
export const CrewPrism=icon('crew-prism',<>{plane('m12 2 9 10-9 10V12L3 7Z')}<path d="m12 2 9 10-9 10L3 12ZM3 12h18M12 2v20m-9-10 9 5 9-5"/></>);
export const CrewNodes=icon('crew-nodes',<>{plane('M3 3h7v7H3ZM14 14h7v7h-7Z')}<path d="M3 3h7v7H3ZM14 14h7v7h-7ZM14 3h7v7h-7ZM3 14h7v7H3ZM10 6h4M6 10v4m12-4v4m-8 4h4"/></>);
export function BrandMark({className=''}:{className?:string}){return <span aria-hidden="true" className={'hh-brand-mark '+className}/>;}
