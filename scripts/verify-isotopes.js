#!/usr/bin/env node
/**
 * Checks js/isotopes.js against the ENSDF adopted half-lives published by NNDC.
 *
 *   npm run verify-isotopes
 *
 * Needs Node 18+ and network access to www.nndc.bnl.gov (behind an HTTPS proxy,
 * run it with NODE_USE_ENV_PROXY=1 on Node 22.21+). For each isotope it
 * reads the "Adopted Levels" dataset page, takes the T1/2 of the ground state
 * (or of the isomeric level for the metastable states) and compares it with the
 * `ensdf` text and `halfLifeSec` in the table. Exits with status 1 on any
 * difference, so a new ENSDF evaluation shows up as a failing check.
 */
'use strict';

const path = require('node:path');
const { ISOTOPES, nucleusOf, sourceUrl } = require(path.join(__dirname, '..', 'js', 'isotopes.js'));

/** Excitation energy (keV) of the metastable levels in the table. */
const ISOMER_LEVEL_KEV = { 'TC-99M1': 142.68, 'KR-81M1': 190.6 };
const ENSDF_UNITS = { ms: 'ms', s: 's', m: 'min', h: 'h', d: 'd', y: 'y' };
const SECONDS_PER = { ms: 1e-3, s: 1, min: 60, h: 3600, d: 86400, y: 365.25 * 86400 };

const stripTags = (html) => html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Drops event-handler and title attributes. NNDC keeps the evaluators' notes in
 * onmouseover="Tip('...')" tooltips whose text contains markup, which would
 * otherwise break the tag and row matching below.
 */
const removeTooltipAttributes = (html) => html
    .replace(/\s(?:on\w+|title)\s*=\s*"[^"]*"/gi, '')
    .replace(/\s(?:on\w+|title)\s*=\s*'[^']*'/gi, '');

/** A half-life cell starts with a number and a time unit, e.g. "6.0072 h 9 % IT = ...". */
const HALF_LIFE_CELL = /^([\d.]+)\s*(ms|s|m|h|d|y)\b\s*(\+?\d+(?:\s*-\s*\d+)?)?/;

/**
 * The adopted T1/2 cell of the level at `levelKeV`, e.g. "1.2575 m 2 % ε = 100".
 * The cell is found by its shape rather than its column, because rows do not
 * always have the same cells (the XREF column is missing from some).
 */
function findHalfLifeCell(html, levelKeV) {
    const rows = removeTooltipAttributes(html).match(/<tr[\s\S]*?<\/tr>/gi) || [];
    let inLevelTable = false;

    for (const row of rows) {
        const cells = (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(stripTags);
        if (cells.some((cell) => cell.startsWith('E(level)'))) {
            inLevelTable = true;
            continue;
        }
        const energy = Number.parseFloat(cells[0]);
        if (!inLevelTable || !Number.isFinite(energy) || Math.abs(energy - levelKeV) >= 0.5) continue;

        const halfLife = cells.slice(1).find((cell) => HALF_LIFE_CELL.test(cell));
        if (halfLife) return halfLife;
    }
    return null;
}

/** "1.2575 m 2 % ε = 100" -> { text: "1.2575 ± 0.0002 min", seconds: 75.45 } */
function parseEnsdfHalfLife(cell) {
    const match = HALF_LIFE_CELL.exec(cell || '');
    if (!match) return null;

    const [, value, ensdfUnit, uncertaintyDigits] = match;
    const unit = ENSDF_UNITS[ensdfUnit];
    const decimals = value.includes('.') ? value.split('.')[1].length : 0;
    const lastDigits = uncertaintyDigits ? Math.max(...uncertaintyDigits.match(/\d+/g).map(Number)) : null;
    const uncertainty = lastDigits === null ? '' : ` ± ${(lastDigits * 10 ** -decimals).toFixed(decimals)}`;

    return {
        text: `${value}${uncertainty} ${unit}`,
        seconds: Number((Number(value) * SECONDS_PER[unit]).toPrecision(10)),
    };
}

async function checkIsotope(isotope) {
    const url = sourceUrl(isotope.symbol); // the same page the calculator links to
    const response = await fetch(url, { headers: { 'User-Agent': 'half-life-calculator isotope check' } });
    if (!response.ok) return { ok: false, message: `HTTP ${response.status} for ${url}` };

    const cell = findHalfLifeCell(await response.text(), ISOMER_LEVEL_KEV[isotope.symbol] || 0);
    const nndc = parseEnsdfHalfLife(cell);
    if (!nndc) return { ok: false, message: `could not read T1/2 from NNDC (cell: ${JSON.stringify(cell)})` };

    const sameText = nndc.text === isotope.ensdf;
    const sameSeconds = Math.abs(nndc.seconds - isotope.halfLifeSec) <= 1e-9 * nndc.seconds;
    return sameText && sameSeconds
        ? { ok: true, message: nndc.text }
        : { ok: false, message: `table has ${isotope.ensdf} (${isotope.halfLifeSec} s), NNDC has ${nndc.text} (${nndc.seconds} s)` };
}

async function main() {
    let failures = 0;
    for (const isotope of ISOTOPES) {
        let result;
        try {
            result = await checkIsotope(isotope);
        } catch (error) {
            result = { ok: false, message: error.message };
        }
        if (!result.ok) failures += 1;
        console.log(`${result.ok ? 'ok  ' : 'DIFF'}  ${isotope.symbol.padEnd(8)} ${result.message}`);
        await new Promise((resolve) => setTimeout(resolve, 300)); // be gentle with the server
    }
    console.log(failures === 0
        ? `\nAll ${ISOTOPES.length} half-lives match NNDC.`
        : `\n${failures} of ${ISOTOPES.length} half-lives differ from NNDC or could not be checked.`);
    process.exitCode = failures === 0 ? 0 : 1;
}

if (require.main === module) {
    main();
}

module.exports = { nucleusOf, findHalfLifeCell, parseEnsdfHalfLife };
