import {readFileSync} from 'node:fs';
import {filterMatches, searchTermsFrom} from '../src/alternatives.js';
const body = JSON.parse(readFileSync('fixtures/serpapi-google-lens.json','utf8'));
const all = body.visual_matches;
console.log('fixture entries:', all.length);
const fromExample = filterMatches(all, 'example.com');
console.log('when the original is example.com ->', fromExample.length, 'kept:', fromExample.map(m=>m.source).join(', '));
const fromHm = filterMatches(all, 'hm.com');
console.log('when the original is hm.com      ->', fromHm.length, 'kept:', fromHm.map(m=>m.source).join(', '));
console.log('cheapest first:', fromHm.map(m=>m.price.amount).join(' < '));

const g = (t: string, brand: string|null, cat: string) => ({title:t, brand, category:cat} as any);
for (const x of [
  g('Oversized Boxy Fit Biker Jacket - 1236612001','Bershka','upper_body'),
  g('Lucas Carpenter Straight Leg Trousers | Cotton | Mocha','Percival','lower_body'),
  g('E462197-000','UNIQLO','lower_body'),
]) console.log('text fallback query:', JSON.stringify(searchTermsFrom(x)));
