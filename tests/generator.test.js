'use strict';

// Mo-99/Tc-99m generator physics. Run with: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    InputError, DecayModel, Measurement, ParentDaughterModel, Generator,
    MO99_TO_TC99M_BRANCHING, MO99_BREAKTHROUGH_LIMIT,
} = require('../js/decay-core.js');
const { findIsotope } = require('../js/isotopes.js');

const HOUR = 3600;
const DAY = 86400;
const close = (actual, expected, relTol = 1e-9) =>
    assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * relTol,
        `expected ${actual} to be within ${relTol} of ${expected}`);

const mo99 = new DecayModel(findIsotope('MO-99').halfLifeSec);
const tc99m = new DecayModel(findIsotope('TC-99M1').halfLifeSec);
const model = new ParentDaughterModel({ parent: mo99, daughter: tc99m, branching: MO99_TO_TC99M_BRANCHING });
const at = (iso) => new Date(iso);

/** Integrates dNp/dt = −λp·Np, dNd/dt = b·λp·Np − λd·Nd with RK4; returns the daughter activity. */
function integrateDaughterActivity(seconds, steps = 20000) {
    const { parentRate: lp, daughterRate: ld, branching: b } = model;
    const derivative = ([np, nd]) => [-lp * np, b * lp * np - ld * nd];
    let state = [1 / lp, 0]; // parent activity 1 at t = 0, no daughter
    const h = seconds / steps;
    for (let i = 0; i < steps; i += 1) {
        const k1 = derivative(state);
        const k2 = derivative(state.map((v, j) => v + h / 2 * k1[j]));
        const k3 = derivative(state.map((v, j) => v + h / 2 * k2[j]));
        const k4 = derivative(state.map((v, j) => v + h * k3[j]));
        state = state.map((v, j) => v + h / 6 * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    }
    return ld * state[1];
}

test('branching fraction and breakthrough limit constants', () => {
    assert.equal(MO99_TO_TC99M_BRANCHING, 0.8778);   // ENSDF 2017: 82.2% direct + 5.58% via cascades
    assert.equal(MO99_BREAKTHROUGH_LIMIT, 0.15e-3);  // 0.15 kBq/MBq
});

test('Bateman ingrowth matches a direct numerical solution of the decay equations', () => {
    for (const hours of [1, 6, 22.8, 24, 72]) {
        close(model.ingrowth(hours * HOUR), integrateDaughterActivity(hours * HOUR), 1e-8);
    }
    assert.equal(model.ingrowth(0), 0);
});

test('Tc-99m peaks about 22.8 h after an elution', () => {
    const peak = model.timeOfMaximum;
    assert.ok(peak / HOUR > 22.7 && peak / HOUR < 23.0, `peak at ${peak / HOUR} h`);
    assert.ok(model.ingrowth(peak) > model.ingrowth(peak - 60));
    assert.ok(model.ingrowth(peak) > model.ingrowth(peak + 60));
});

test('transient equilibrium: ingrowth approaches the equilibrium ratio', () => {
    // Tc/Mo in equilibrium = b · λd/(λd − λp) ≈ 0.966 for b = 0.8778.
    close(model.equilibriumRatio, 0.8778 * model.daughterRate / (model.daughterRate - model.parentRate));
    assert.ok(model.equilibriumRatio > 0.96 && model.equilibriumRatio < 0.97);
    // Ten days after an elution the ratio daughter(t)/parent(t) equals the equilibrium ratio.
    const t = 10 * DAY;
    close(model.ingrowth(t) / mo99.decayFactor(t), model.equilibriumRatio, 1e-6);
});

test('Generator: Mo-99 decays from calibration; Tc-99m grows in after the last elution', () => {
    const calibration = new Measurement(1000e9, at('2025-01-06T12:00:00'), 'generatorMo'); // 1 TBq on Monday noon
    const generator = new Generator({ model, calibration, lastElution: at('2025-01-06T06:00:00') });
    const elution = generator.elute(at('2025-01-07T06:00:00'), 0.9);

    const moAtLastElution = mo99.activityAfter(1000e9, -6 * HOUR);
    close(elution.parentActivity, mo99.activityAfter(1000e9, 18 * HOUR));
    close(elution.available, moAtLastElution * model.ingrowth(24 * HOUR));
    close(elution.eluate, elution.available * 0.9);
    assert.equal(elution.sinceLastElution, 24 * HOUR);
    assert.ok(elution.fractionOfMaximum > 0.99 && elution.fractionOfMaximum <= 1); // 24 h is just past the peak
    close(elution.maximumAt.getTime(), at('2025-01-06T06:00:00').getTime() + model.timeOfMaximum * 1000);
});

test('Generator without a last elution assumes transient equilibrium', () => {
    const generator = new Generator({ model, calibration: new Measurement(500, at('2025-01-06T12:00:00')) });
    const elution = generator.elute(at('2025-01-08T12:00:00'));
    close(elution.available, model.equilibriumRatio * mo99.activityAfter(500, 2 * DAY));
    assert.equal(elution.sinceLastElution, null);
    assert.equal(elution.fractionOfMaximum, null);
});

test('Generator rejects an elution before the last one and impossible efficiencies', () => {
    const generator = new Generator({
        model, calibration: new Measurement(500, at('2025-01-06T12:00:00')), lastElution: at('2025-01-07T08:00:00'),
    });
    const field = (name) => (e) => e instanceof InputError && e.field === name;
    assert.throws(() => generator.elute(at('2025-01-07T07:00:00')), field('generatorElution'));
    assert.throws(() => generator.elute(at('2025-01-08T08:00:00'), 1.2), field('generatorEfficiency'));
    assert.throws(() => generator.elute(at('2025-01-08T08:00:00'), 0), field('generatorEfficiency'));
    assert.throws(() => new ParentDaughterModel({ parent: mo99, daughter: tc99m, branching: 1.5 }), field('generatorBranching'));
    assert.throws(() => new ParentDaughterModel({ parent: tc99m, daughter: mo99, branching: 0.9 }), RangeError);
});

test('breakthrough: the Mo/Tc ratio reaches the limit at the predicted time', () => {
    const time = at('2025-01-07T08:00:00');
    const check = model.breakthrough({ parentActivity: 0.05e-3 * 30e9, daughterActivity: 30e9, time, limit: 0.15e-3 });
    close(check.ratio, 0.05e-3);
    assert.equal(check.exceeded, false);
    // At limitReachedAt, decaying both from the elution gives exactly the limit.
    const t = check.secondsToLimit;
    close((0.05e-3 * 30e9 * mo99.decayFactor(t)) / (30e9 * tc99m.decayFactor(t)), 0.15e-3, 1e-9);
    close(check.limitReachedAt.getTime(), time.getTime() + t * 1000);

    const over = model.breakthrough({ parentActivity: 0.2e-3, daughterActivity: 1, time, limit: 0.15e-3 });
    assert.equal(over.exceeded, true);
    assert.ok(over.secondsToLimit < 0); // the limit was crossed before the elution time

    const none = model.breakthrough({ parentActivity: 0, daughterActivity: 1, time, limit: 0.15e-3 });
    assert.equal(none.limitReachedAt, null);
    assert.throws(() => model.breakthrough({ parentActivity: 1, daughterActivity: 0, time, limit: 0.15e-3 }), InputError);
});
