'use strict';

// Offline tests for the NNDC page parser in scripts/verify-isotopes.js.
const test = require('node:test');
const assert = require('node:assert/strict');

const { nucleusOf, findHalfLifeCell, parseEnsdfHalfLife } = require('../scripts/verify-isotopes.js');

test('nucleusOf converts table symbols to NNDC nucleus names', () => {
    assert.equal(nucleusOf('TC-99M1'), '99Tc');
    assert.equal(nucleusOf('F-18'), '18F');
    assert.equal(nucleusOf('RB-82'), '82Rb');
});

test('parseEnsdfHalfLife reads ENSDF notation (uncertainty in last digits)', () => {
    assert.deepEqual(parseEnsdfHalfLife('1.2575 m 2 % ε = 100'), { text: '1.2575 ± 0.0002 min', seconds: 75.45 });
    assert.deepEqual(parseEnsdfHalfLife('30.08 y 9 % β- = 100'), { text: '30.08 ± 0.09 y', seconds: 949252608 });
    assert.deepEqual(parseEnsdfHalfLife('12.7006 h 20 % β- = 38.5 3'), { text: '12.7006 ± 0.0020 h', seconds: 45722.16 });
    // Asymmetric uncertainty: the larger side is kept.
    assert.deepEqual(parseEnsdfHalfLife('10.5 h +5-3'), { text: '10.5 ± 0.5 h', seconds: 37800 });
    assert.deepEqual(parseEnsdfHalfLife('7.214 h'), { text: '7.214 h', seconds: 25970.4 });
});

test('parseEnsdfHalfLife returns null for formats the table never needs', () => {
    assert.equal(parseEnsdfHalfLife('STABLE'), null);
    assert.equal(parseEnsdfHalfLife('0.19 ns 2'), null); // sub-millisecond units
    assert.equal(parseEnsdfHalfLife(null), null);
});

test('findHalfLifeCell finds the level row even when rows have different cells', () => {
    // Evaluator notes live in tooltip attributes that contain markup and ">".
    const tooltip = 'onmouseover="Tip(\'Weighted average <b>of</b> 6.0067 h 5 (2004Wo02) > other\')"';
    const html = `
        <p>Header text without a level table: 0.0 1 h</p>
        <table>
          <tr><th>E(level) (keV)</th><th>XREF</th><th>J &pi; (level)</th><th>T 1/2 (level)</th></tr>
          <tr><td>0.0</td><td>AB</td><td>9/2+</td><td>211100 y 1200</td></tr>
          <tr><td>140.5110 10</td><td>7/2+</td><td>0.19 ns 2</td><td>140.511 1</td></tr>
          <tr><td>142.6836 11</td><td>1/2-</td><td ${tooltip}>6.0072 h 9 % IT = 99.9963 6</td><td>2.1726 4</td></tr>
        </table>`;
    assert.equal(findHalfLifeCell(html, 0), '211100 y 1200');
    assert.equal(findHalfLifeCell(html, 142.68), '6.0072 h 9 % IT = 99.9963 6');
    assert.equal(findHalfLifeCell(html, 140.51), null); // a nanosecond level: no usable cell
    assert.equal(findHalfLifeCell(html, 999), null);
});
