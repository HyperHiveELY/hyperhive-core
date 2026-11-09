import type {KeyboardEvent} from 'react';

/** Arrow keys move focus and selection within a tablist; Tab exits the group. */
export function tabNavigation(event:KeyboardEvent<HTMLElement>){
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const tabs=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
 const current=tabs.indexOf(document.activeElement as HTMLButtonElement);
 if(current<0||!tabs.length)return;
 event.preventDefault();
 const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
 tabs[next].focus();tabs[next].click();
}
