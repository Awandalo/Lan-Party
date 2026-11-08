const amountFormat=new Intl.NumberFormat('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2});
const currencyFormat=new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'});
export const euro=(cents:number)=>currencyFormat.format(cents/100);
export const euroAmount=(cents:number)=>amountFormat.format(cents/100);

// Parse Dutch grouping without converting the stored integer-cent contract.
// Keep accepting ungrouped dot decimals entered in the existing forms.
export function euroCents(value:string){
 const text=value.trim(),grouped=/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text);
 if(!grouped&&!/^\d{1,7}(?:[.,]\d{1,2})?$/.test(text))throw Error('Enter a nonnegative amount with at most two decimal places (for example 1.234,56).');
 const [whole,fraction='']=(grouped?text.replace(/\./g,''):text).replace(',','.').split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents>100000000)throw Error('Rental must be at most €1.000.000,00.');
 return cents;
}
