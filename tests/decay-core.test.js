'use strict';

// Run with: npm test   (or: node --test tests/)
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    InputError, TIME_UNITS, timeToSeconds, toBestTimeUnit, parseDateTimeLocal, toDateTimeLocalValue,
    SELECTABLE_ACTIVITY_UNITS, ActivityUnit, DecayModel, Measurement, Vial, DecayScenario, Format,
} = require('../js/decay-core.js');
const { ISOTOPES, findIsotope } = require('../js/isotopes.js');

const HOUR = 3600;
const DAY = 86400;
const close = (actual, expected, relTol = 1e-12) =>
    assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * relTol,
        `expected ${actual} to be within ${relTol} of ${expected}`);
const at = (iso) => new Date(iso);

test('time units use a Julian year (365.25 days)', () => {
    assert.equal(TIME_UNITS.years, 365.25 * DAY);
    assert.equal(timeToSeconds(2, 'hours'), 7200);
    assert.throws(() => timeToSeconds(1, 'fortnights'), RangeError);
});

test('toBestTimeUnit picks the largest unit that is at least 1', () => {
    assert.deepEqual(toBestTimeUnit(90), { value: 1.5, unit: 'minutes' });
    assert.deepEqual(toBestTimeUnit(-2 * DAY), { value: -2, unit: 'days' });
    assert.deepEqual(toBestTimeUnit(0.5), { value: 0.5, unit: 'seconds' });
});

test('parseDateTimeLocal reads local time and rejects impossible dates', () => {
    const date = parseDateTimeLocal('2025-03-04T05:06:07');
    assert.deepEqual(
        [date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()],
        [2025, 2, 4, 5, 6, 7]);
    assert.equal(parseDateTimeLocal('2025-03-04T05:06').getSeconds(), 0);
    assert.equal(parseDateTimeLocal('0050-01-01T00:00').getFullYear(), 50);
    assert.equal(parseDateTimeLocal('2025-02-30T00:00'), null);
    assert.equal(parseDateTimeLocal(''), null);
    assert.equal(parseDateTimeLocal('yesterday'), null);
});

test('toDateTimeLocalValue round-trips through parseDateTimeLocal', () => {
    const date = new Date(2024, 11, 31, 23, 59, 58);
    assert.equal(toDateTimeLocalValue(date), '2024-12-31T23:59:58');
    assert.equal(parseDateTimeLocal(toDateTimeLocalValue(date)).getTime(), date.getTime());
});

test('ActivityUnit converts every selectable unit', () => {
    const expectedBq = {
        Bq: 1, kBq: 1e3, MBq: 1e6, GBq: 1e9, TBq: 1e12,
        nCi: 37, 'µCi': 3.7e4, mCi: 3.7e7, Ci: 3.7e10, Rd: 1e6,
    };
    assert.deepEqual([...SELECTABLE_ACTIVITY_UNITS].sort(), Object.keys(expectedBq).sort());
    for (const [symbol, bq] of Object.entries(expectedBq)) {
        close(ActivityUnit.parse(symbol).toBq(1), bq);
        close(ActivityUnit.parse(symbol).fromBq(bq), 1);
    }
});

test('ActivityUnit: empty symbol is unitless, unknown symbols throw', () => {
    assert.equal(ActivityUnit.parse(''), ActivityUnit.NONE);
    assert.ok(ActivityUnit.NONE.isUnitless);
    assert.equal(ActivityUnit.NONE.toBq(12.5), 12.5);
    assert.throws(() => ActivityUnit.parse('MCi2'), RangeError);
    assert.throws(() => ActivityUnit.parse('Gy'), RangeError);
});

test('DecayModel follows A = A0 · 2^(-t/T)', () => {
    const model = new DecayModel(6 * HOUR);
    close(model.activityAfter(800, 6 * HOUR), 400);
    close(model.activityAfter(800, 18 * HOUR), 100);
    close(model.activityAfter(800, -6 * HOUR), 1600); // back-calculation
    assert.equal(model.halfLivesIn(3 * HOUR), 0.5);
    close(model.timeToDecay(800, 100), 18 * HOUR);
    close(model.timeToDecay(100, 800), -18 * HOUR);
});

test('DecayModel rejects non-positive or non-finite half-lives', () => {
    for (const bad of [0, -1, NaN, Infinity]) {
        assert.throws(() => new DecayModel(bad), InputError);
    }
});

test('Measurement validates activity and time', () => {
    assert.throws(() => new Measurement(-1, new Date()), InputError);
    assert.throws(() => new Measurement(Infinity, new Date()), InputError);
    assert.throws(() => new Measurement(1, new Date('nope')), InputError);
    assert.equal(new Measurement(0, new Date()).activity, 0);
});

test('Vial validates volumes and splits activity', () => {
    const vial = new Vial(10, 2.5);
    assert.equal(vial.concentration(1000), 100);
    assert.equal(vial.drawnActivity(1000), 250);
    assert.equal(new Vial(10).drawnActivity(1000), null);
    assert.throws(() => new Vial(0), (e) => e instanceof InputError && e.field === 'totalVolume');
    assert.throws(() => new Vial(10, 11), (e) => e instanceof InputError && e.field === 'partialVolume');
    assert.throws(() => new Vial(10, -1), (e) => e instanceof InputError && e.field === 'partialVolume');
});

test('DecayScenario without residual uses the initial measurement', () => {
    const scenario = new DecayScenario({
        model: new DecayModel(2 * HOUR),
        initial: new Measurement(1000, at('2025-01-01T08:00:00')),
        vial: new Vial(10, 2),
    });
    const result = scenario.activityAt(at('2025-01-01T12:00:00'));
    close(result.activity, 250);
    close(result.decayFactor, 0.25);
    assert.equal(result.halfLives, 2);
    assert.equal(result.elapsedSeconds, 4 * HOUR);
    close(result.concentration, 25);
    close(result.drawnActivity, 50);
});

test('DecayScenario with residual: injected = decayed initial − residual, referenced at residual time', () => {
    const model = new DecayModel(1 * HOUR);
    const scenario = new DecayScenario({
        model,
        initial: new Measurement(400, at('2025-01-01T08:00:00')),
        residual: new Measurement(20, at('2025-01-01T09:00:00'), 'residualActivity'),
    });
    // 400 decays to 200 after one half-life; 20 stayed in the syringe -> 180 injected at 09:00.
    assert.equal(scenario.reference.activity, 180);
    assert.equal(scenario.reference.time.getTime(), at('2025-01-01T09:00:00').getTime());
    close(scenario.activityAt(at('2025-01-01T10:00:00')).activity, 90);

    // Same result as decaying both components separately.
    const t = at('2025-01-01T13:30:00');
    const separately = model.activityAfter(400, 5.5 * HOUR) - model.activityAfter(20, 4.5 * HOUR);
    close(scenario.activityAt(t).activity, separately);
});

test('DecayScenario rejects impossible residual measurements', () => {
    const base = {
        model: new DecayModel(HOUR),
        initial: new Measurement(400, at('2025-01-01T08:00:00')),
    };
    assert.throws(() => new DecayScenario({ ...base,
        residual: new Measurement(10, at('2025-01-01T07:00:00')) }),
    (e) => e instanceof InputError && e.field === 'residualTime');
    assert.throws(() => new DecayScenario({ ...base,
        residual: new Measurement(250, at('2025-01-01T09:00:00')) }),
    (e) => e instanceof InputError && e.field === 'residualActivity');
});

test('timeToReach goes forward for lower targets and backward for higher ones', () => {
    const scenario = new DecayScenario({
        model: new DecayModel(6 * HOUR),
        initial: new Measurement(800, at('2025-01-01T00:00:00')),
    });
    const later = scenario.timeToReach(100);
    close(later.elapsedSeconds, 18 * HOUR);
    close(later.halfLives, 3);
    assert.equal(later.time.getTime(), at('2025-01-01T18:00:00').getTime());

    const earlier = scenario.timeToReach(1600);
    close(earlier.elapsedSeconds, -6 * HOUR);
    assert.equal(scenario.timeToReach(800).elapsedSeconds, 0);
    assert.throws(() => scenario.timeToReach(0), InputError);
});

test('timeToReach explains a zero reference activity', () => {
    const scenario = new DecayScenario({
        model: new DecayModel(HOUR),
        initial: new Measurement(0, at('2025-01-01T00:00:00')),
    });
    assert.throws(() => scenario.timeToReach(1), /initial activity is zero/);
});

test('volumeFor: volume that holds the desired dose at administration time', () => {
    // 1000 MBq in 10 mL at 08:00, T½ = 2 h. At 10:00 the vial holds 500 MBq (50 MBq/mL).
    const scenario = new DecayScenario({
        model: new DecayModel(2 * HOUR),
        initial: new Measurement(1000e6, at('2025-01-01T08:00:00')),
        vial: new Vial(10),
    });
    const dose = scenario.volumeFor(100e6, at('2025-01-01T10:00:00'), at('2025-01-01T08:00:00'));
    close(dose.volumeMl, 2);
    close(dose.concentration, 50e6);
    close(dose.vialActivity, 500e6);
    // Checked at 08:00, two hours before administration, the syringe reads twice as much.
    close(dose.readingActivity, 200e6);
    assert.equal(scenario.volumeFor(100e6, at('2025-01-01T10:00:00')).readingActivity, null);
});

test('volumeFor rejects impossible doses and a missing vial', () => {
    const base = { model: new DecayModel(HOUR), initial: new Measurement(100, at('2025-01-01T08:00:00')) };
    const field = (name) => (e) => e instanceof InputError && e.field === name;
    assert.throws(() => new DecayScenario(base).volumeFor(10, at('2025-01-01T08:00:00')), field('totalVolume'));
    const scenario = new DecayScenario({ ...base, vial: new Vial(5) });
    assert.throws(() => scenario.volumeFor(60, at('2025-01-01T09:00:00')), field('desiredActivity')); // only 50 left
    assert.throws(() => scenario.volumeFor(0, at('2025-01-01T09:00:00')), field('desiredActivity'));
    const empty = new DecayScenario({ ...base, initial: new Measurement(0, at('2025-01-01T08:00:00')), vial: new Vial(5) });
    assert.throws(() => empty.volumeFor(1, at('2025-01-01T09:00:00')), field('desiredActivity'));
});

test('schedule: evenly spaced decay table', () => {
    const scenario = new DecayScenario({
        model: new DecayModel(HOUR),
        initial: new Measurement(800, at('2025-01-01T08:00:00')),
    });
    const rows = scenario.schedule(at('2025-01-01T08:00:00'), HOUR, 4);
    assert.deepEqual(rows.map((r) => r.activity), [800, 400, 200, 100]);
    assert.equal(rows[3].time.getTime(), at('2025-01-01T11:00:00').getTime());
    assert.throws(() => scenario.schedule(new Date(), 0, 4), (e) => e.field === 'tableStep');
    assert.throws(() => scenario.schedule(new Date(), HOUR, 2.5), (e) => e.field === 'tableRows');
    assert.throws(() => scenario.schedule(new Date(), HOUR, DecayScenario.MAX_TABLE_ROWS + 1), (e) => e.field === 'tableRows');
});

test('Format.number keeps precision for small plain values', () => {
    assert.equal(Format.number(0.0004), '4.000e-4');
    assert.equal(Format.number(0.25), '0.2500');
    assert.equal(Format.number(50), '50.000');
    assert.equal(Format.number(0), '0');
    assert.equal(Format.number(NaN), 'N/A');
});

test('Format.activity picks the SI prefix that keeps the value in [1, 1000)', () => {
    assert.equal(Format.activity(3.7e10, 'Ci'), '1.000 Ci');
    assert.equal(Format.activity(1.85e7, 'Ci'), '500.000 µCi');
    assert.equal(Format.activity(370e6, 'Bq'), '370.000 MBq');
    assert.equal(Format.activity(7.4e12, 'Bq'), '7.400 TBq');
    assert.equal(Format.activity(1e6, 'Rd'), '1.000 Rd');
    assert.equal(Format.activity(0, 'Bq'), '0.000 Bq');
    // Rounding must not produce "1000.000 kBq".
    assert.equal(Format.activity(999999.9999, 'Bq'), '1.000 MBq');
    assert.equal(Format.activity(1e-20, 'Bq'), '1.000e-20 Bq');
});

test('Format.activityIn shows the value in the unit the user picked', () => {
    assert.equal(Format.activityIn(1.85e7, ActivityUnit.parse('mCi')), '0.5000 mCi');
    assert.equal(Format.activityIn(42, ActivityUnit.NONE), '42.000');
});

test('Format.equivalents lists the other base units only', () => {
    assert.deepEqual(Format.equivalents(18.5e6, ActivityUnit.parse('MBq')), ['500.000 µCi', '18.500 Rd']);
    assert.deepEqual(Format.equivalents(3.7e10, ActivityUnit.parse('Ci')), ['37.000 GBq', '37.000 kRd']);
    assert.deepEqual(Format.equivalents(5, ActivityUnit.NONE), []);
});

test('Format.duration, halfLife and percent', () => {
    assert.equal(Format.duration(0), '0 seconds');
    assert.equal(Format.duration(-2 * DAY), '2.000 days');
    assert.equal(Format.duration(90), '1.500 minutes');
    assert.equal(Format.halfLife(21620.88), '6.006 h');
    assert.equal(Format.shortDuration(1800), '30 min');
    assert.equal(Format.shortDuration(5400), '1.5 h');
    assert.equal(Format.percent(0.79370052), '79.37%');
    assert.equal(Format.percent(1e-7), '1.00e-5%');
});

test('Format.dateTime uses a 24-hour clock and survives out-of-range dates', () => {
    assert.match(Format.dateTime(new Date(2025, 0, 1, 0, 5, 0)), /00:05:00/);
    assert.match(Format.dateTime(new Date(8.64e15 + 1)), /outside/);
});

test('isotope table: unique symbols, positive half-lives, a source for every value', () => {
    assert.equal(new Set(ISOTOPES.map((i) => i.symbol)).size, ISOTOPES.length);
    for (const isotope of ISOTOPES) {
        assert.ok(isotope.halfLifeSec > 0, isotope.symbol);
        assert.ok(isotope.reference, `${isotope.symbol} has no reference`);
    }
    assert.equal(findIsotope('XX-1'), null);
});

test('isotope table: the value used equals the ENSDF value shown to the user', () => {
    const secondsPer = { s: 1, min: 60, h: HOUR, d: DAY, y: TIME_UNITS.years };
    for (const { symbol, ensdf, halfLifeSec } of ISOTOPES) {
        const match = /^([\d.]+)(?: ± [\d.]+)? (s|min|h|d|y)$/.exec(ensdf);
        assert.ok(match, `${symbol}: unexpected ENSDF text "${ensdf}"`);
        close(Number(match[1]) * secondsPer[match[2]], halfLifeSec, 1e-12);
    }
});

test('isotope table: ENSDF adopted values (NNDC, checked 2026-11-13)', () => {
    // Includes the values that were outdated before this check.
    close(findIsotope('RB-82').halfLifeSec / 60, 1.2575);       // was 1.273 min (+1.2%)
    close(findIsotope('I-131').halfLifeSec / DAY, 8.0252);      // was 8.0197 d
    close(findIsotope('MO-99').halfLifeSec / HOUR, 65.924);     // was 65.976 h
    close(findIsotope('TC-99M1').halfLifeSec / HOUR, 6.0072);   // was 6.0058 h
    close(findIsotope('F-18').halfLifeSec / 60, 109.77);
    close(findIsotope('CO-60').halfLifeSec / DAY, 1925.28);
});
