#!/usr/bin/env node
/**
 * Audit MN01 card abilities by keyword.
 * Run from project root: node scripts/audit-abilities.js
 * Output: abilities grouped by primary verb (flip, delete, draw, etc.) for coverage tracking.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cardsPath = join(__dirname, '../src/data/cards.json');
const cards = JSON.parse(readFileSync(cardsPath, 'utf-8'));

const MN01 = cards.filter((c) => c.set === 'MN01');

const KEYWORDS = [
	'draw',
	'discard',
	'delete',
	'return',
	'shift',
	'flip',
	'play',
	'reveal',
	'refresh',
	'rearrange',
	'ignore', // passive
	'increased', 'reduced', // value modifiers
];

function getText(row) {
	if (!row || !row.text) return '';
	return (row.emphasis || '') + ' ' + (row.text || '');
}

function primaryKeyword(text) {
	const t = text.toLowerCase();
	for (const kw of KEYWORDS) {
		if (t.includes(kw)) return kw;
	}
	if (t.trim()) return '(other)';
	return null;
}

const byKeyword = {};
const byProtocol = {};
const triggered = new Set(); // ability texts that look like triggers (have a verb we implement)

for (const card of MN01) {
	const protocol = card.protocol;
	for (const [rowName, row] of [
		['top', card.top],
		['middle', card.middle],
		['bottom', card.bottom],
	]) {
		const text = getText(row).trim();
		if (!text) continue;

		const kw = primaryKeyword(text);
		if (!byKeyword[kw]) byKeyword[kw] = [];
		byKeyword[kw].push({ protocol, value: card.value, row: rowName, text: text.slice(0, 80) });

		if (!byProtocol[protocol]) byProtocol[protocol] = [];
		byProtocol[protocol].push({ value: card.value, row: rowName, text: text.slice(0, 60) });
	}
}

console.log('=== MN01 abilities by keyword (effect type) ===\n');
const order = ['draw', 'discard', 'delete', 'return', 'shift', 'flip', 'play', 'reveal', 'refresh', 'rearrange', 'ignore', 'increased', 'reduced', '(other)'];
for (const kw of order) {
	const list = byKeyword[kw];
	if (!list) continue;
	console.log(`${kw} (${list.length} ability rows):`);
	const uniqueTexts = [...new Set(list.map((e) => e.text))];
	uniqueTexts.slice(0, 12).forEach((t) => console.log(`  - ${t}${t.length >= 80 ? '...' : ''}`));
	if (uniqueTexts.length > 12) console.log(`  ... and ${uniqueTexts.length - 12} more`);
	console.log('');
}

console.log('=== By protocol (for QA) ===');
for (const [protocol, list] of Object.entries(byProtocol).sort()) {
	console.log(`  ${protocol}: ${list.length} ability rows`);
}
