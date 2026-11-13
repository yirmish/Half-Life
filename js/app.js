/**
 * Half-Life — the calculator page.
 *
 * Reads the form, builds a DecayScenario (decay-core.js) and shows three kinds
 * of answers: the activity now, the activity at a chosen time, and when a
 * target activity is reached. A result the user asked for stays "live": it is
 * recomputed whenever an input changes, so it can never show a stale value.
 */
(function (root) {
    'use strict';

    const {
        InputError, ActivityUnit, DecayModel, Measurement, Vial, DecayScenario, Format,
        SELECTABLE_ACTIVITY_UNITS, timeToSeconds, toBestTimeUnit, toDateTimeLocalValue,
        ISOTOPES, findIsotope,
        createElement, Field, FormReader, MessageBox, ToggleSection, ResultPanel,
        DotField, ThemeManager,
    } = root.HalfLife;

    /** Input ids, keyed by the field names that validation and InputError.field use. */
    const FIELD_IDS = Object.freeze({
        initialActivity: 'initialActivity',
        halfLife: 'halfLifeValue',
        initialTime: 'initialDateTime',
        residualActivity: 'residualActivityValue',
        residualTime: 'residualMeasurementTime',
        totalVolume: 'totalVolume',
        partialVolume: 'partialVolume',
        specificTime: 'specificDateTime',
        targetActivity: 'targetActivityValue',
    });

    /** How often the "Current Activity" result is refreshed. */
    const LIVE_UPDATE_INTERVAL_MS = 1000;

    /* ================================================================== */
    /* Inputs with behaviour of their own                                  */
    /* ================================================================== */

    /** Isotope menu + half-life value + unit. Picking an isotope fills and locks the fields. */
    class HalfLifeInput {
        constructor({ isotopeSelect, valueInput, unitSelect, hint }) {
            this.isotopeSelect = isotopeSelect;
            this.valueInput = valueInput;
            this.unitSelect = unitSelect;
            this.hint = hint;

            this.#populateIsotopes();
            isotopeSelect.addEventListener('change', () => this.#applyIsotope());
        }

        get selectedIsotope() {
            return findIsotope(this.isotopeSelect.value);
        }

        /** Half-life in seconds, or null (with the problem recorded on `reader`). */
        read(reader) {
            const isotope = this.selectedIsotope;
            // Use the exact table value, not the 5-digit number shown in the field.
            if (isotope) return isotope.halfLifeSec;

            const value = reader.number('halfLife', { name: 'half-life', positive: true });
            return value === null ? null : timeToSeconds(value, this.unitSelect.value);
        }

        #populateIsotopes() {
            const toOption = (isotope) => {
                const option = createElement('option', null,
                    `${isotope.name} · T½ ${Format.halfLife(isotope.halfLifeSec)}`);
                option.value = isotope.symbol;
                return option;
            };
            this.isotopeSelect.append(...ISOTOPES.map(toOption));
        }

        #applyIsotope() {
            const isotope = this.selectedIsotope;
            if (isotope) {
                const { value, unit } = toBestTimeUnit(isotope.halfLifeSec);
                this.valueInput.value = String(Number(value.toPrecision(5)));
                this.unitSelect.value = unit;
                this.hint.textContent = `Half-life of ${isotope.name} from the NNDC table. ` +
                    'Choose “Custom Half-life” to enter your own value.';
            }
            // Switching back to "Custom" keeps the value, so it can be adjusted rather than retyped.
            this.valueInput.disabled = Boolean(isotope);
            this.unitSelect.disabled = Boolean(isotope);
            this.hint.hidden = !isotope;
        }
    }

    /**
     * The activity unit menu. The residual and target activities use the same unit,
     * shown next to their inputs; under each activity input the value is also
     * shown converted to the other units.
     */
    class ActivityUnitControl {
        constructor({ select, inheritedUnitLabels, conversions }) {
            this.select = select;
            this.inheritedUnitLabels = inheritedUnitLabels;
            this.conversions = conversions; // [{ input, output }]

            this.#populate();
            select.addEventListener('change', () => this.render());
            conversions.forEach(({ input }) => input.addEventListener('input', () => this.render()));
            this.render();
        }

        get unit() {
            return ActivityUnit.parse(this.select.value);
        }

        render() {
            const unit = this.unit;

            const renderConversion = ({ input, output }) => {
                const value = Number(input.value);
                const hasValue = input.value !== '' && Number.isFinite(value);
                const lines = hasValue ? Format.equivalents(unit.toBq(value), unit) : [];
                output.replaceChildren(...lines.map((text) => createElement('span', null, `= ${text}`)));
            };

            this.inheritedUnitLabels.forEach((label) => {
                label.textContent = unit.isUnitless ? 'no unit' : unit.symbol;
                label.classList.toggle('unit-addon--empty', unit.isUnitless);
            });
            this.conversions.forEach(renderConversion);
        }

        #populate() {
            const option = (value, text) => {
                const element = createElement('option', null, text);
                element.value = value;
                return element;
            };
            this.select.append(
                option('', '-- No Unit --'),
                ...SELECTABLE_ACTIVITY_UNITS.map((symbol) => option(symbol, symbol)),
            );
        }
    }

    /* ================================================================== */
    /* Result rendering helpers                                            */
    /* ================================================================== */

    /** A labelled activity: the value in the chosen unit, then its equivalents. */
    function createActivityGroup(label, activity, unit, suffix = '') {
        const group = createElement('div', 'result-group');
        group.append(
            createElement('div', 'result-group__label', label),
            createElement('div', 'result-group__primary', Format.activityIn(activity, unit) + suffix),
        );

        const equivalents = Format.equivalents(activity, unit);
        if (equivalents.length > 0) {
            const list = createElement('ul', 'result-group__equivalents');
            list.append(...equivalents.map((text) => createElement('li', null, `= ${text}${suffix}`)));
            group.append(list);
        }
        return group;
    }

    /** E.g. "2.000 hours after the initial measurement · 0.333 half-lives · 79.37% remaining". */
    function describeDecay({ elapsedSeconds, halfLives, decayFactor }, referenceName) {
        if (elapsedSeconds === 0) return `At the time of the ${referenceName}: no decay yet.`;

        const halfLivesText = `${Format.number(Math.abs(halfLives))} half-lives`;
        return elapsedSeconds > 0
            ? `${Format.duration(elapsedSeconds)} after the ${referenceName} · ${halfLivesText} · ` +
              `${Format.percent(decayFactor)} remaining`
            : `${Format.duration(elapsedSeconds)} before the ${referenceName} (back-calculated) · ` +
              `${halfLivesText} · ${Format.percent(decayFactor)} of the reference activity`;
    }

    const referenceNameOf = (scenario) =>
        (scenario.usesResidual ? 'residual measurement' : 'initial measurement');

    /* ================================================================== */
    /* Calculations                                                        */
    /* ================================================================== */

    /**
     * One kind of answer, shown in its own panel. Subclasses say which extra
     * inputs they need, how to compute the answer and how to display it.
     */
    class Calculation {
        constructor(panelElement) {
            this.panel = new ResultPanel(panelElement);
        }

        /** Extra inputs beyond the shared ones (initial activity, half-life, ...). */
        readExtras(/* reader, unit */) {
            return {};
        }

        compute(/* scenario, extras */) {
            throw new Error(`${this.constructor.name} must implement compute().`);
        }

        render(/* result, { scenario, unit } */) {
            throw new Error(`${this.constructor.name} must implement render().`);
        }

        /** With a residual, states the injected activity that everything is based on. */
        renderReference(scenario, unit) {
            const { activity, time } = scenario.reference;
            this.panel.setSlot('reference', scenario.usesResidual
                ? `Injected activity: ${Format.activityIn(activity, unit)} at ${Format.dateTime(time)} ` +
                  '(initial activity decayed to the residual measurement, minus the residual).'
                : '');
        }
    }

    /** Activity at one moment, plus concentration and partial-volume activity when a volume is given. */
    class ActivityAtTimeCalculation extends Calculation {
        compute(scenario, { time }) {
            return scenario.activityAt(time);
        }

        render(result, { scenario, unit }) {
            const perMl = unit.isUnitless ? ' per mL' : '/mL';
            const groups = [
                ['Activity', result.activity, ''],
                result.concentration !== null && ['Concentration', result.concentration, perMl],
                result.drawnActivity !== null &&
                    [`Activity in Partial Volume (${Format.number(scenario.vial.drawnMl)} mL)`, result.drawnActivity, ''],
            ].filter(Boolean);

            this.panel.slot('groups').replaceChildren(
                ...groups.map(([label, activity, suffix]) => createActivityGroup(label, activity, unit, suffix)));
            this.panel.setSlot('time', Format.dateTime(result.time));
            this.panel.setSlot('decay', describeDecay(result, referenceNameOf(scenario)));
            this.renderReference(scenario, unit);
        }
    }

    class CurrentActivityCalculation extends ActivityAtTimeCalculation {
        readExtras() {
            return { time: new Date() };
        }
    }

    class SpecificTimeCalculation extends ActivityAtTimeCalculation {
        readExtras(reader) {
            return { time: reader.dateTime('specificTime', { name: 'specific date and time' }) };
        }
    }

    class TimeToTargetCalculation extends Calculation {
        readExtras(reader, unit) {
            const target = reader.number('targetActivity', { name: 'target activity', positive: true });
            return { targetActivity: target === null ? null : unit.toBq(target) };
        }

        compute(scenario, { targetActivity }) {
            return scenario.timeToReach(targetActivity);
        }

        render({ time, elapsedSeconds, halfLives }, { scenario, unit }) {
            const isPast = time.getTime() < Date.now();
            const relative = Math.abs(elapsedSeconds) < 1e-3
                ? 'already at the target activity'
                : `${Format.duration(elapsedSeconds)} ${elapsedSeconds > 0 ? 'after' : 'before'} it ` +
                  `(${Format.number(Math.abs(halfLives))} half-lives)`;

            this.panel.setSlot('time', `${Format.dateTime(time)}${isPast ? ' (in the past)' : ''}`);
            this.panel.setSlot('reference-name', referenceNameOf(scenario));
            this.panel.setSlot('relative', relative);
            this.renderReference(scenario, unit);
        }
    }

    /* ================================================================== */
    /* The application                                                     */
    /* ================================================================== */

    class CalculatorApp {
        constructor(doc = document) {
            const byId = (id) => doc.getElementById(id);

            this.form = byId('calculatorForm');
            this.fields = Object.fromEntries(
                Object.entries(FIELD_IDS).map(([name, id]) => [name, Field.fromId(id, doc)]));
            this.messages = new MessageBox(byId('messageBox'));

            this.halfLife = new HalfLifeInput({
                isotopeSelect: byId('isotopeSelect'),
                valueInput: byId('halfLifeValue'),
                unitSelect: byId('halfLifeUnit'),
                hint: byId('halfLifeHint'),
            });

            this.activityUnit = new ActivityUnitControl({
                select: byId('initialActivityUnit'),
                inheritedUnitLabels: [...doc.querySelectorAll('[data-inherited-unit]')],
                conversions: [
                    ['initialActivity', 'initialActivityConversion'],
                    ['residualActivityValue', 'residualActivityConversion'],
                    ['targetActivityValue', 'targetActivityConversion'],
                ].map(([inputId, outputId]) => ({ input: byId(inputId), output: byId(outputId) })),
            });

            const refresh = () => this.refresh();
            this.residualSection = new ToggleSection(byId('toggleResidualButton'), byId('residualInputsSection'), {
                closedLabel: 'Consider Residual Activity',
                openLabel: 'Ignore Residual Activity',
                onToggle: refresh,
            });
            this.volumeSection = new ToggleSection(byId('toggleVolumeButton'), byId('volumeInputsSection'), {
                closedLabel: 'Consider Concentration/Partial Volume',
                openLabel: 'Ignore Volume Calculations',
                onToggle: refresh,
            });

            this.calculations = {
                current: new CurrentActivityCalculation(byId('currentActivitySection')),
                specific: new SpecificTimeCalculation(byId('specificActivitySection')),
                target: new TimeToTargetCalculation(byId('timeToTargetSection')),
            };

            this.#bindEvents(byId);
            setInterval(() => this.#tickCurrentActivity(), LIVE_UPDATE_INTERVAL_MS);
        }

        /** A calculate button was pressed: show that result and keep it live from now on. */
        request(calculation) {
            calculation.panel.activate();
            this.messages.hide();
            const problem = this.refresh().get(calculation);
            if (problem) this.messages.show(problem, 'error');
        }

        /** Recomputes every active result. Returns a Map of calculation -> first error message. */
        refresh() {
            const problems = new Map();
            const fieldErrors = new Map();

            for (const calculation of Object.values(this.calculations)) {
                if (!calculation.panel.isActive) continue;
                const errors = this.#run(calculation);
                if (errors.size === 0) continue;

                problems.set(calculation, errors.values().next().value);
                errors.forEach((message, fieldName) => {
                    if (!fieldErrors.has(fieldName)) fieldErrors.set(fieldName, message);
                });
            }

            Object.entries(this.fields).forEach(([name, field]) => field.setError(fieldErrors.get(name)));

            // An error pop-up whose problem has since been fixed would be stale: remove it.
            const shownError = this.messages.visibleError;
            if (shownError && ![...problems.values()].includes(shownError)) this.messages.hide();

            return problems;
        }

        /** Runs one calculation and shows its result. Returns its errors (field -> message), if any. */
        #run(calculation) {
            const reader = new FormReader(this.fields);
            const inputs = this.#readSharedInputs(reader);
            const extras = calculation.readExtras(reader, inputs.unit);

            if (reader.isValid) {
                try {
                    const scenario = this.#buildScenario(inputs);
                    calculation.render(calculation.compute(scenario, extras), { scenario, unit: inputs.unit });
                    calculation.panel.show();
                    return reader.errors;
                } catch (error) {
                    if (!(error instanceof InputError)) throw error;
                    reader.fail(error.field, error.message);
                }
            }

            calculation.panel.hide();
            return reader.errors;
        }

        #readSharedInputs(reader) {
            return {
                unit: this.activityUnit.unit,
                initialActivity: reader.number('initialActivity', { name: 'initial activity' }),
                halfLifeSeconds: this.halfLife.read(reader),
                initialTime: reader.dateTime('initialTime', { name: 'date and time of the initial activity' }),
                residual: this.residualSection.isOpen ? this.#readResidual(reader) : null,
                vial: this.volumeSection.isOpen ? this.#readVolumes(reader) : null,
            };
        }

        /** The residual is applied once a residual activity has been entered. */
        #readResidual(reader) {
            if (this.fields.residualActivity.isEmpty) return null;
            return {
                activity: reader.number('residualActivity', { name: 'residual activity' }),
                time: reader.dateTime('residualTime', { name: 'residual measurement date and time' }),
            };
        }

        /** Volumes are applied once a total (or partial) volume has been entered. */
        #readVolumes(reader) {
            const { totalVolume, partialVolume } = this.fields;
            if (totalVolume.isEmpty && partialVolume.isEmpty) return null;
            if (totalVolume.isEmpty) {
                return reader.fail('totalVolume', 'Enter the total volume to use a partial volume.');
            }
            return {
                totalMl: reader.number('totalVolume', { name: 'total volume', positive: true }),
                partialMl: reader.number('partialVolume', { name: 'partial volume', positive: true, required: false }),
            };
        }

        #buildScenario({ unit, initialActivity, halfLifeSeconds, initialTime, residual, vial }) {
            return new DecayScenario({
                model: new DecayModel(halfLifeSeconds),
                initial: new Measurement(unit.toBq(initialActivity), initialTime, 'initialActivity'),
                residual: residual &&
                    new Measurement(unit.toBq(residual.activity), residual.time, 'residualActivity'),
                vial: vial && new Vial(vial.totalMl, vial.partialMl),
            });
        }

        #bindEvents(byId) {
            const buttonTargets = {
                calculateButton: this.calculations.current,
                calculateSpecificButton: this.calculations.specific,
                calculateTimeToTargetButton: this.calculations.target,
            };
            Object.entries(buttonTargets).forEach(([id, calculation]) =>
                byId(id).addEventListener('click', () => this.request(calculation)));

            // Keep every requested result in step with the inputs.
            this.form.addEventListener('input', () => this.refresh());
            this.form.addEventListener('change', () => this.refresh());

            // "Now" fills the date field next to the button.
            this.form.addEventListener('click', (event) => {
                const button = event.target.closest('[data-now-for]');
                if (!button) return;
                const input = byId(button.dataset.nowFor);
                input.value = toDateTimeLocalValue(new Date());
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });

            // Enter in a field runs the calculation of the section the field is in.
            this.form.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' || !event.target.matches('input')) return;
                const section = event.target.closest('[data-enter-action]');
                byId(section ? section.dataset.enterAction : 'calculateButton').click();
            });
        }

        #tickCurrentActivity() {
            const { current } = this.calculations;
            if (current.panel.isVisible && document.visibilityState === 'visible') {
                this.#run(current);
            }
        }
    }

    /* ================================================================== */
    /* Start-up                                                            */
    /* ================================================================== */

    function start() {
        const byId = (id) => document.getElementById(id);
        root.HalfLife.theme = new ThemeManager({
            toggleButton: byId('themeSwitcherButton'),
            panel: byId('themeSwitcherPanel'),
            dotField: new DotField(byId('dotField')),
        });
        root.HalfLife.app = new CalculatorApp(document);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})(globalThis);
