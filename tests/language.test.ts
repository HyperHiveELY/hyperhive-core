import {afterEach, expect, it, vi} from 'vitest';
import chinese from '../apps/web/src/i18n/zh-CN.json';
import {getLanguage,initializeLanguage,setLanguage,subscribeLanguage,uiText} from '../apps/web/src/i18n/language.js';

function browser(initial?: string) {
  const items = new Map<string,string>(initial ? [['hyperhive.language', initial]] : []);
  const storage = {getItem: (key:string) => items.get(key) ?? null, setItem:(key:string,value:string) => items.set(key,value)};
  const win = Object.assign(new EventTarget(),{localStorage:storage});
  vi.stubGlobal('window',win);
  vi.stubGlobal('localStorage',storage);
  vi.stubGlobal('document',{documentElement:{lang:''}});
  return {items,win,storage};
}
afterEach(()=>vi.unstubAllGlobals());

it('restores the landing choice on direct entry to the dashboard and syncs other tabs',async()=>{
  const {items,win,storage}=browser('zh-CN');
  await initializeLanguage();
  expect(document.documentElement.lang).toBe('zh-CN');
  expect(uiText(' Withdraw ')).toBe(' 提现 ');
  const notify=vi.fn(),unsubscribe=subscribeLanguage(notify);
  await setLanguage('en');
  expect(items.get('hyperhive.language')).toBe('en');
  expect(uiText(' Withdraw ')).toBe(' Withdraw ');
  items.set('hyperhive.language','zh-CN');
  win.dispatchEvent(Object.assign(new Event('storage'),{key:'hyperhive.language',storageArea:storage}));
  expect(getLanguage()).toBe('zh-CN');
  expect(notify).toHaveBeenCalledTimes(2);
  unsubscribe();
});
it('defaults to English and supports switching with storage disabled',async()=>{
  browser('invalid');
  await initializeLanguage();expect(getLanguage()).toBe('en');
  vi.stubGlobal('localStorage',{setItem(){throw Error('storage disabled');}});
  await setLanguage('zh-CN');
  expect(uiText('0x0123456789abcdef')).toBe('0x0123456789abcdef');
  expect(uiText('12.81 USDC')).toBe('12.81 USDC');
  expect(uiText(0.98)).toBe(0.98);
  expect(uiText('My custom crew')).toBe('My custom crew');
});
it('distinguishes opposite financial actions in Chinese',()=>{
  expect(chinese.Withdraw).toBe('提现');expect(chinese['Revoke agent']).toBe('撤销代理授权');
  expect(chinese.Long).toBe('做多');expect(chinese.Short).toBe('做空');
});
