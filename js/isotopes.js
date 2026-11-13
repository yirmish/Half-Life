/**
 * Half-Life — isotope table.
 *
 * Half-lives are in seconds, from the National Nuclear Data Center (NNDC, NuDat).
 * The list is ordered roughly by how often each isotope is used in nuclear
 * medicine and radiotherapy. Symbols use the SYMBOL-MASS form, with M1 for the
 * metastable states.
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.HalfLife = Object.assign(root.HalfLife || {}, api);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const ISOTOPES = Object.freeze([
        { symbol: 'TC-99M1',  name: 'Technetium-99m (Tc-99m)',   halfLifeSec: 21620.88 },
        { symbol: 'F-18',     name: 'Fluorine-18 (F-18)',        halfLifeSec: 6586.26 },
        { symbol: 'I-131',    name: 'Iodine-131 (I-131)',        halfLifeSec: 692898.48 },
        { symbol: 'I-123',    name: 'Iodine-123 (I-123)',        halfLifeSec: 47604.6 },
        { symbol: 'IR-192',   name: 'Iridium-192 (Ir-192)',      halfLifeSec: 6378396.8 },
        { symbol: 'I-125',    name: 'Iodine-125 (I-125)',        halfLifeSec: 5133052.8 },
        { symbol: 'GA-68',    name: 'Gallium-68 (Ga-68)',        halfLifeSec: 4062.6 },
        { symbol: 'LU-177',   name: 'Lutetium-177 (Lu-177)',     halfLifeSec: 574356 },
        { symbol: 'Y-90',     name: 'Yttrium-90 (Y-90)',         halfLifeSec: 230590.8 },
        { symbol: 'IN-111',   name: 'Indium-111 (In-111)',       halfLifeSec: 242328.48 },
        { symbol: 'RA-223',   name: 'Radium-223 (Ra-223)',       halfLifeSec: 987552 },
        { symbol: 'CO-60',    name: 'Cobalt-60 (Co-60)',         halfLifeSec: 166342174.7 },
        { symbol: 'TL-201',   name: 'Thallium-201 (Tl-201)',     halfLifeSec: 262483.2 },
        { symbol: 'GA-67',    name: 'Gallium-67 (Ga-67)',        halfLifeSec: 281810.88 },
        { symbol: 'RB-82',    name: 'Rubidium-82 (Rb-82)',       halfLifeSec: 76.38 },
        { symbol: 'CS-137',   name: 'Cesium-137 (Cs-137)',       halfLifeSec: 949171073 },
        { symbol: 'SM-153',   name: 'Samarium-153 (Sm-153)',     halfLifeSec: 166622.4 },
        { symbol: 'SR-89',    name: 'Strontium-89 (Sr-89)',      halfLifeSec: 4365792 },
        { symbol: 'C-11',     name: 'Carbon-11 (C-11)',          halfLifeSec: 1221.84 },
        { symbol: 'N-13',     name: 'Nitrogen-13 (N-13)',        halfLifeSec: 597.9 },
        { symbol: 'O-15',     name: 'Oxygen-15 (O-15)',          halfLifeSec: 122.24 },
        { symbol: 'XE-133',   name: 'Xenon-133 (Xe-133)',        halfLifeSec: 453384 },
        { symbol: 'KR-81M1',  name: 'Krypton-81m (Kr-81m)',      halfLifeSec: 13.1 },
        { symbol: 'ZR-89',    name: 'Zirconium-89 (Zr-89)',      halfLifeSec: 282276 },
        { symbol: 'I-124',    name: 'Iodine-124 (I-124)',        halfLifeSec: 360806.4 },
        { symbol: 'CU-64',    name: 'Copper-64 (Cu-64)',         halfLifeSec: 45720 },
        { symbol: 'RE-188',   name: 'Rhenium-188 (Re-188)',      halfLifeSec: 61214.4 },
        { symbol: 'RE-186',   name: 'Rhenium-186 (Re-186)',      halfLifeSec: 321282.24 },
        { symbol: 'P-32',     name: 'Phosphorus-32 (P-32)',      halfLifeSec: 1232755.2 },
        { symbol: 'AC-225',   name: 'Actinium-225 (Ac-225)',     halfLifeSec: 857088 },
        { symbol: 'HO-166',   name: 'Holmium-166 (Ho-166)',      halfLifeSec: 96580.8 },
        { symbol: 'AT-211',   name: 'Astatine-211 (At-211)',     halfLifeSec: 25970.4 },
        { symbol: 'CU-67',    name: 'Copper-67 (Cu-67)',         halfLifeSec: 222588 },
        { symbol: 'BI-213',   name: 'Bismuth-213 (Bi-213)',      halfLifeSec: 2735.4 },
        { symbol: 'PB-212',   name: 'Lead-212 (Pb-212)',         halfLifeSec: 38304 },
        { symbol: 'TH-227',   name: 'Thorium-227 (Th-227)',      halfLifeSec: 1613952 },
        { symbol: 'CR-51',    name: 'Chromium-51 (Cr-51)',       halfLifeSec: 2393435.52 },
        { symbol: 'MO-99',    name: 'Molybdenum-99 (Mo-99)',     halfLifeSec: 237513.6 },
        { symbol: 'GE-68',    name: 'Germanium-68 (Ge-68)',      halfLifeSec: 23410080 },
        { symbol: 'SR-82',    name: 'Strontium-82 (Sr-82)',      halfLifeSec: 2191104 },
        { symbol: 'W-188',    name: 'Tungsten-188 (W-188)',      halfLifeSec: 6028512 },    ].map(Object.freeze));

    function findIsotope(symbol) {
        return ISOTOPES.find((isotope) => isotope.symbol === symbol) || null;
    }

    return { ISOTOPES, findIsotope };
});
