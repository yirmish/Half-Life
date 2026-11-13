/**
 * Half-Life — isotope table.
 *
 * Half-lives are the ENSDF adopted (evaluated) values, as published by the
 * National Nuclear Data Center (NNDC, https://www.nndc.bnl.gov/nudat3/, the
 * "Adopted Levels" dataset of each nuclide). Last checked against NNDC on
 * 2026-11-13; re-check with `npm run verify-isotopes`.
 *
 *   halfLifeSec  the value used in calculations (years are Julian, 365.25 d, as at NNDC)
 *   ensdf        the evaluated value with its uncertainty, as NNDC lists it
 *   reference    where that evaluation was published
 *
 * The list is ordered roughly by how often each isotope is used in nuclear
 * medicine and radiotherapy. Symbols use the SYMBOL-MASS form, with M1 for
 * the metastable states.
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
        { symbol: 'TC-99M1', name: 'Technetium-99m (Tc-99m)',   halfLifeSec: 21625.92,    ensdf: '6.0072 ± 0.0009 h',     reference: 'Nucl. Data Sheets 145, 25 (2017)' },
        { symbol: 'F-18',    name: 'Fluorine-18 (F-18)',        halfLifeSec: 6586.2,      ensdf: '109.77 ± 0.05 min',     reference: 'Nucl. Physics A595, 1 (1995)' },
        { symbol: 'I-131',   name: 'Iodine-131 (I-131)',        halfLifeSec: 693377.28,   ensdf: '8.0252 ± 0.0006 d',     reference: 'Nucl. Data Sheets 107, 2715 (2006)' },
        { symbol: 'I-123',   name: 'Iodine-123 (I-123)',        halfLifeSec: 47602.8,     ensdf: '13.2230 ± 0.0019 h',    reference: 'Nucl. Data Sheets 174, 1 (2021)' },
        { symbol: 'IR-192',  name: 'Iridium-192 (Ir-192)',      halfLifeSec: 6378825.6,   ensdf: '73.829 ± 0.011 d',      reference: 'Nucl. Data Sheets 113, 1871 (2012)' },
        { symbol: 'I-125',   name: 'Iodine-125 (I-125)',        halfLifeSec: 5132764.8,   ensdf: '59.407 ± 0.010 d',      reference: 'Nucl. Data Sheets 112, 495 (2011)' },
        { symbol: 'GA-68',   name: 'Gallium-68 (Ga-68)',        halfLifeSec: 4062.6,      ensdf: '67.71 ± 0.08 min',      reference: 'Nucl. Data Sheets 113, 1735 (2012)' },
        { symbol: 'LU-177',  name: 'Lutetium-177 (Lu-177)',     halfLifeSec: 574067.52,   ensdf: '6.6443 ± 0.0009 d',     reference: 'Nucl. Data Sheets 159, 1 (2019)' },
        { symbol: 'Y-90',    name: 'Yttrium-90 (Y-90)',         halfLifeSec: 230580,      ensdf: '64.05 ± 0.05 h',        reference: 'Nucl. Data Sheets 165, 1 (2020)' },
        { symbol: 'IN-111',  name: 'Indium-111 (In-111)',       halfLifeSec: 242326.08,   ensdf: '2.8047 ± 0.0004 d',     reference: 'Nucl. Data Sheets 110, 1239 (2009)' },
        { symbol: 'RA-223',  name: 'Radium-223 (Ra-223)',       halfLifeSec: 987552,      ensdf: '11.43 ± 0.05 d',        reference: 'Nucl. Data Sheets 93, 846 (2001)' },
        { symbol: 'CO-60',   name: 'Cobalt-60 (Co-60)',         halfLifeSec: 166344192,   ensdf: '1925.28 ± 0.14 d',      reference: 'Nucl. Data Sheets 114, 1849 (2013)' },
        { symbol: 'TL-201',  name: 'Thallium-201 (Tl-201)',     halfLifeSec: 262828.8,    ensdf: '3.0420 ± 0.0016 d',     reference: 'Nucl. Data Sheets 187, 355 (2023)' },
        { symbol: 'GA-67',   name: 'Gallium-67 (Ga-67)',        halfLifeSec: 281810.88,   ensdf: '3.2617 ± 0.0005 d',     reference: 'Nucl. Data Sheets 106, 159 (2005)' },
        { symbol: 'RB-82',   name: 'Rubidium-82 (Rb-82)',       halfLifeSec: 75.45,       ensdf: '1.2575 ± 0.0002 min',   reference: 'Nucl. Data Sheets 157, 260 (2019)' },
        { symbol: 'CS-137',  name: 'Cesium-137 (Cs-137)',       halfLifeSec: 949252608,   ensdf: '30.08 ± 0.09 y',        reference: 'Nucl. Data Sheets 108, 2173 (2007)' },
        { symbol: 'SM-153',  name: 'Samarium-153 (Sm-153)',     halfLifeSec: 166622.4,    ensdf: '46.284 ± 0.004 h',      reference: 'Nucl. Data Sheets 170, 1 (2020)' },
        { symbol: 'SR-89',   name: 'Strontium-89 (Sr-89)',      halfLifeSec: 4368643.2,   ensdf: '50.563 ± 0.025 d',      reference: 'Nucl. Data Sheets 114, 1 (2013)' },
        { symbol: 'C-11',    name: 'Carbon-11 (C-11)',          halfLifeSec: 1221.84,     ensdf: '20.364 ± 0.014 min',    reference: 'Nucl. Physics A880, 88 (2012)' },
        { symbol: 'N-13',    name: 'Nitrogen-13 (N-13)',        halfLifeSec: 597.504,     ensdf: '9.9584 ± 0.0036 min',   reference: 'Nucl. Data Sheets 198, 1 (2024)' },
        { symbol: 'O-15',    name: 'Oxygen-15 (O-15)',          halfLifeSec: 122.24,      ensdf: '122.24 ± 0.16 s',       reference: 'Nucl. Physics A523, 1 (1991)' },
        { symbol: 'XE-133',  name: 'Xenon-133 (Xe-133)',        halfLifeSec: 453384,      ensdf: '5.2475 ± 0.0005 d',     reference: 'Nucl. Data Sheets 112, 855 (2011)' },
        { symbol: 'KR-81M1', name: 'Krypton-81m (Kr-81m)',      halfLifeSec: 13.1,        ensdf: '13.10 ± 0.02 s',        reference: 'Nucl. Data Sheets 199, 271 (2025)' },
        { symbol: 'ZR-89',   name: 'Zirconium-89 (Zr-89)',      halfLifeSec: 282276,      ensdf: '78.41 ± 0.12 h',        reference: 'Nucl. Data Sheets 114, 1 (2013)' },
        { symbol: 'I-124',   name: 'Iodine-124 (I-124)',        halfLifeSec: 360806.4,    ensdf: '4.1760 ± 0.0003 d',     reference: 'Nucl. Data Sheets 109, 1655 (2008)' },
        { symbol: 'CU-64',   name: 'Copper-64 (Cu-64)',         halfLifeSec: 45722.16,    ensdf: '12.7006 ± 0.0020 h',    reference: 'Nucl. Data Sheets 178, 41 (2021)' },
        { symbol: 'RE-188',  name: 'Rhenium-188 (Re-188)',      halfLifeSec: 61218,       ensdf: '17.005 ± 0.003 h',      reference: 'Nucl. Data Sheets 150, 1 (2018)' },
        { symbol: 'RE-186',  name: 'Rhenium-186 (Re-186)',      halfLifeSec: 321278.4,    ensdf: '3.7185 ± 0.0005 d',     reference: 'Nucl. Data Sheets 183, 1 (2022)' },
        { symbol: 'P-32',    name: 'Phosphorus-32 (P-32)',      halfLifeSec: 1232582.4,   ensdf: '14.266 ± 0.004 d',      reference: 'Nucl. Data Sheets 201, 1 (2025)' },
        { symbol: 'AC-225',  name: 'Actinium-225 (Ac-225)',     halfLifeSec: 857088,      ensdf: '9.920 ± 0.003 d',       reference: 'ENSDF (evaluation cut-off Oct 2019)' },
        { symbol: 'HO-166',  name: 'Holmium-166 (Ho-166)',      halfLifeSec: 96566.4,     ensdf: '26.824 ± 0.012 h',      reference: 'Nucl. Data Sheets 109, 1103 (2008)' },
        { symbol: 'AT-211',  name: 'Astatine-211 (At-211)',     halfLifeSec: 25970.4,     ensdf: '7.214 ± 0.007 h',       reference: 'Nucl. Data Sheets 114, 661 (2013)' },
        { symbol: 'CU-67',   name: 'Copper-67 (Cu-67)',         halfLifeSec: 222588,      ensdf: '61.83 ± 0.12 h',        reference: 'Nucl. Data Sheets 106, 159 (2005)' },
        { symbol: 'BI-213',  name: 'Bismuth-213 (Bi-213)',      halfLifeSec: 2735.4,      ensdf: '45.59 ± 0.06 min',      reference: 'Nucl. Data Sheets 181, 475 (2022)' },
        { symbol: 'PB-212',  name: 'Lead-212 (Pb-212)',         halfLifeSec: 38239.2,     ensdf: '10.622 ± 0.007 h',      reference: 'Nucl. Data Sheets 168, 117 (2020)' },
        { symbol: 'TH-227',  name: 'Thorium-227 (Th-227)',      halfLifeSec: 1615420.8,   ensdf: '18.697 ± 0.007 d',      reference: 'Nucl. Data Sheets 132, 257 (2016)' },
        { symbol: 'CR-51',   name: 'Chromium-51 (Cr-51)',       halfLifeSec: 2393625.6,   ensdf: '27.704 ± 0.004 d',      reference: 'Nucl. Data Sheets 144, 1 (2017)' },
        { symbol: 'MO-99',   name: 'Molybdenum-99 (Mo-99)',     halfLifeSec: 237326.4,    ensdf: '65.924 ± 0.006 h',      reference: 'Nucl. Data Sheets 145, 25 (2017)' },
        { symbol: 'GE-68',   name: 'Germanium-68 (Ge-68)',      halfLifeSec: 23408352,    ensdf: '270.93 ± 0.13 d',       reference: 'Nucl. Data Sheets 113, 1735 (2012)' },
        { symbol: 'SR-82',   name: 'Strontium-82 (Sr-82)',      halfLifeSec: 2190240,     ensdf: '25.35 ± 0.03 d',        reference: 'Nucl. Data Sheets 157, 260 (2019)' },
        { symbol: 'W-188',   name: 'Tungsten-188 (W-188)',      halfLifeSec: 6028992,     ensdf: '69.78 ± 0.12 d',        reference: 'Nucl. Data Sheets 150, 1 (2018)' },
    ].map(Object.freeze));

    function findIsotope(symbol) {
        return ISOTOPES.find((isotope) => isotope.symbol === symbol) || null;
    }

    /** "TC-99M1" -> "99Tc": the nucleus name NNDC uses (an isomer is listed under its nucleus). */
    function nucleusOf(symbol) {
        const [, element, mass] = /^([A-Z]+)-(\d+)/.exec(symbol);
        return `${mass}${element.charAt(0)}${element.slice(1).toLowerCase()}`;
    }

    /** NNDC page with the ENSDF "Adopted Levels" dataset the half-life is taken from. */
    function sourceUrl(symbol) {
        return `https://www.nndc.bnl.gov/nudat3/getdataset.jsp?nucleus=${nucleusOf(symbol)}&unc=NDS`;
    }

    /** NNDC page with the Mo-99 decay data (Browne & Tuli) behind the Mo-99 -> Tc-99m branching fraction. */
    const MO99_DECAY_DATA_URL = 'https://www.nndc.bnl.gov/nudat3/decaysearchdirect.jsp?nuc=99MO&unc=NDS';

    return { ISOTOPES, findIsotope, nucleusOf, sourceUrl, MO99_DECAY_DATA_URL };
});
