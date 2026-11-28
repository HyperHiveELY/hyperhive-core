/** Credits and model-token counts are separate units. Checkout uses 1,000 credits per USDC. */
export const creditsToUsdc=(credits:number)=>credits/1000;
export type HypeQuote={usdcPerHype:number;at:number};
export const HYPE_QUOTE_MAX_AGE=90_000;
export function hypeQuoteFromMarkets(markets:{name:string;midPx?:string|null;markPx?:string}[],at=Date.now()):HypeQuote|null{
 const market=markets.find(m=>m.name==='HYPE'),price=Number(market?.midPx??market?.markPx);
 return Number.isFinite(price)&&price>0?{usdcPerHype:price,at}:null;
}
/** Never substitute a 1:1 rate or reuse an expired market price. Display only; not a payment quote. */
export function usdcToHype(usdc:number,quote:HypeQuote|null,now=Date.now()):number|null{
 if(!quote||!Number.isFinite(usdc)||usdc<0||!Number.isFinite(quote.usdcPerHype)||quote.usdcPerHype<=0||!Number.isFinite(quote.at)||quote.at>now||now-quote.at>=HYPE_QUOTE_MAX_AGE)return null;
 return usdc/quote.usdcPerHype;
}
export function formatHype(value:number){
 if(!Number.isFinite(value)||value<0)return '—';
 if(value>0&&value<0.00000001)return '<0.00000001';
 return value.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:8});
}
