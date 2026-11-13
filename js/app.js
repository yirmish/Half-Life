/**
 * Half-Life — the calculator page.
 *
 * Reads the form, builds a DecayScenario (decay-core.js) and shows five kinds
 * of answers: the activity now, the activity at a chosen time, when a target
 * activity is reached, the volume to draw for a desired dose, and a decay
 * table. A result the user asked for stays "live": it is recomputed whenever
 * an input changes, so it can never show a stale value.
 */
(function (root) {
    'use strict';

    const {
        InputError, ActivityUnit, DecayModel, Measurement, Vial, DecayScenario, Format,
        BASE_UNITS, SELECTABLE_ACTIVITY_UNITS, timeToSeconds, toBestTimeUnit, toDateTimeLocalValue,
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
        elapsedTime: 'elapsedValue',
        targetActivity: 'targetActivityValue',
        desiredActivity: 'desiredActivityValue',
        administrationTime: 'administrationTime',
        tableStart: 'tableStart',
        tableStep: 'tableStepValue',
        tableRows: 'tableRows',
    });

    /** Every activity input with its own unit menu. The first one sets the main unit. */
    const ACTIVITY_FIELDS = Object.freeze({
        initialActivity: { input: 'initialActivity', unit: 'initialActivityUnit', conversion: 'initialActivityConversion' },
        residualActivity: { input: 'residualActivityValue', unit: 'residualActivityUnit', conversion: 'residualActivityConversion' },
        targetActivity: { input: 'targetActivityValue', unit: 'targetActivityUnit', conversion: 'targetActivityConversion' },
        desiredActivity: { input: 'desiredActivityValue', unit: 'desiredActivityUnit', conversion: 'desiredActivityConversion' },
    });

    /** How often results that depend on the current time are refreshed. */
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

        /** One line for copied results, e.g. "Fluorine-18 (F-18), T½ = 109.77 ± 0.05 min (ENSDF via NNDC)". */
        describe() {
            const isotope = this.selectedIsotope;
            const abbreviations = { seconds: 's', minutes: 'min', hours: 'h', days: 'd', years: 'y' };
            return isotope
                ? `${isotope.name}, T½ = ${isotope.ensdf} (ENSDF via NNDC)`
                : `custom, T½ = ${this.valueInput.value.trim()} ${abbreviations[this.unitSelect.value]}`;
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
                this.hint.textContent = `${isotope.name}: T½ = ${isotope.ensdf} ` +
                    `(ENSDF evaluated value via NNDC; ${isotope.reference}). ` +
                    'Choose “Custom Half-life” to enter your own value.';
            }
            // Switching back to "Custom" keeps the value, so it can be adjusted rather than retyped.
            this.valueInput.disabled = Boolean(isotope);
            this.unitSelect.disabled = Boolean(isotope);
            this.hint.hidden = !isotope;
        }
    }

    /**
     * The unit menus of the activity inputs. The initial activity's unit is the
     * main unit; every other activity field follows it until the user picks a
     * different unit there (picking the main unit again re-links the field).
     * "No unit" applies to all fields or none: a plain number cannot be compared
     * with an amount in Bq or Ci.
     */
    class ActivityUnits {
        constructor(doc, fieldIds) {
            const [mainName] = Object.keys(fieldIds);
            this.fields = Object.fromEntries(Object.entries(fieldIds).map(([name, ids]) => [name, {
                input: doc.getElementById(ids.input),
                select: doc.getElementById(ids.unit),
                conversion: doc.getElementById(ids.conversion),
                followsMain: true,
            }]));
            this.main = this.fields[mainName];
            this.followers = Object.values(this.fields).filter((field) => field !== this.main);

            Object.values(this.fields).forEach((field) => {
                this.#populate(field.select);
                field.input.addEventListener('input', () => this.render());
            });
            this.main.select.addEventListener('change', () => this.render());
            this.followers.forEach((field) => field.select.addEventListener('change', () => {
                field.followsMain = field.select.value === this.main.select.value;
                this.render();
            }));
            this.render();
        }

        get mainUnit() {
            return ActivityUnit.parse(this.main.select.value);
        }

        /** The unit of one activity field, e.g. of('residualActivity'). */
        of(fieldName) {
            return ActivityUnit.parse(this.fields[fieldName].select.value);
        }

        render() {
            const mainUnit = this.mainUnit;
            for (const field of this.followers) {
                if (mainUnit.isUnitless) field.followsMain = true;
                if (field.followsMain) field.select.value = this.main.select.value;
                field.select.querySelector('option[value=""]').disabled = !mainUnit.isUnitless;
                field.select.disabled = mainUnit.isUnitless;
                field.select.title = mainUnit.isUnitless
                    ? 'Choose a unit for the initial activity first'
                    : 'Unit for this value (it can differ from the initial activity’s unit)';
            }
            Object.values(this.fields).forEach((field) => this.#renderConversion(field, mainUnit));
        }

        /** Under each input: the value in the main unit (if different) and in the other base units. */
        #renderConversion({ input, select, conversion }, mainUnit) {
            const unit = ActivityUnit.parse(select.value);
            const value = Number(input.value);
            const lines = [];

            if (input.value !== '' && Number.isFinite(value) && !unit.isUnitless) {
                const bq = unit.toBq(value);
                const showMainUnit = unit.symbol !== mainUnit.symbol;
                if (showMainUnit) lines.push(Format.activityIn(bq, mainUnit));
                BASE_UNITS
                    .filter((base) => base !== unit.baseUnit && !(showMainUnit && base === mainUnit.baseUnit))
                    .forEach((base) => lines.push(Format.activity(bq, base)));
            }
            conversion.replaceChildren(...lines.map((text) => createElement('span', null, `= ${text}`)));
        }

        #populate(select) {
            const option = (value, text) => {
                const element = createElement('option', null, text);
                element.value = value;
                return element;
            };
            select.append(
                option('', '-- No Unit --'),
                ...SELECTABLE_ACTIVITY_UNITS.map((symbol) => option(symbol, symbol)),
            );
        }
    }

    /* ================================================================== */
    /* Result helpers                                                      */
    /* ================================================================== */

    /** The other base units of an activity, e.g. ["9.159 mCi", "338.880 Rd"]. */
    const equivalentsOf = (activity, unit, suffix = '') =>
        Format.equivalents(activity, unit).map((text) => `${text}${suffix}`);

    /** "338.880 MBq (= 9.159 mCi, = 338.880 Rd)" — for copied text. */
    function activityText(activity, unit, suffix = '') {
        const equivalents = equivalentsOf(activity, unit, suffix);
        const main = `${Format.activityIn(activity, unit)}${suffix}`;
        return equivalents.length ? `${main} (= ${equivalents.join(', = ')})` : main;
    }

    /**
     * A labelled result: a main value, then either equivalent values ("= 9.159 mCi")
     * or, with `detail`, one explanatory line.
     */
    function createResultGroup(label, mainText, equivalents = [], detail = '') {
        const group = createElement('div', 'result-group');
        group.append(
            createElement('div', 'result-group__label', label),
            createElement('div', 'result-group__primary', mainText),
        );
        const lines = [...equivalents.map((text) => `= ${text}`), ...(detail ? [detail] : [])];
        if (lines.length > 0) {
            const list = createElement('ul', 'result-group__equivalents');
            list.append(...lines.map((text) => createElement('li', null, text)));
            group.append(list);
        }
        return group;
    }

    const createActivityGroup = (label, activity, unit, suffix = '') =>
        createResultGroup(label, `${Format.activityIn(activity, unit)}${suffix}`, equivalentsOf(activity, unit, suffix));

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

    const perMlSuffix = (unit) => (unit.isUnitless ? ' per mL' : '/mL');
    const pastNote = (time) => (time.getTime() < Date.now() ? ' (in the past)' : '');

    /* ================================================================== */
    /* Calculations                                                        */
    /* ================================================================== */

    /**
     * One kind of answer, shown in its own panel. Subclasses say which extra
     * inputs they need, how to compute the answer and how to display it.
     * Each render also leaves a plain-text `summary` for the Copy button.
     */
    class Calculation {
        /** True when the result changes with the clock; it is then refreshed every second. */
        dependsOnNow = false;

        constructor(panelElement) {
            this.panel = new ResultPanel(panelElement);
            this.summary = [];
        }

        /** Extra inputs beyond the shared ones (initial activity, half-life, ...). */
        readExtras(/* reader, { units } */) {
            return {};
        }

        compute(/* scenario, extras */) {
            throw new Error(`${this.constructor.name} must implement compute().`);
        }

        render(/* result, { scenario, unit, extras } */) {
            throw new Error(`${this.constructor.name} must implement render().`);
        }

        /** With a residual, states the injected activity that everything is based on. */
        renderReference(scenario, unit) {
            const { activity, time } = scenario.reference;
            const text = scenario.usesResidual
                ? `Injected activity: ${Format.activityIn(activity, unit)} at ${Format.dateTime(time)} ` +
                  '(initial activity decayed to the residual measurement, minus the residual).'
                : '';
            this.panel.setSlot('reference', text);
            return text;
        }
    }

    /** Activity at one moment, plus concentration and partial-volume activity when a volume is given. */
    class ActivityAtTimeCalculation extends Calculation {
        timeLabel = 'Time';

        compute(scenario, { time }) {
            return scenario.activityAt(time);
        }

        describeTime(result) {
            return Format.dateTime(result.time);
        }

        render(result, { scenario, unit }) {
            const groups = [
                ['Activity', result.activity, ''],
                result.concentration !== null && ['Concentration', result.concentration, perMlSuffix(unit)],
                result.drawnActivity !== null &&
                    [`Activity in Partial Volume (${Format.number(scenario.vial.drawnMl)} mL)`, result.drawnActivity, ''],
            ].filter(Boolean);

            const timeText = this.describeTime(result, scenario);
            const decayText = describeDecay(result, referenceNameOf(scenario));

            this.panel.slot('groups').replaceChildren(
                ...groups.map(([label, activity, suffix]) => createActivityGroup(label, activity, unit, suffix)));
            this.panel.setSlot('time', timeText);
            this.panel.setSlot('decay', decayText);
            const referenceText = this.renderReference(scenario, unit);

            this.summary = [
                ...groups.map(([label, activity, suffix]) => `${label}: ${activityText(activity, unit, suffix)}`),
                `${this.timeLabel}: ${timeText}`,
                decayText,
                referenceText,
            ].filter(Boolean);
        }
    }

    class CurrentActivityCalculation extends ActivityAtTimeCalculation {
        dependsOnNow = true;
        timeLabel = 'Calculated at';

        readExtras() {
            return { time: new Date() };
        }
    }

    /** Activity at a chosen date, or a chosen interval after the initial measurement. */
    class SpecificTimeCalculation extends ActivityAtTimeCalculation {
        timeLabel = 'For date';

        constructor(panelElement, { modeRadios, modeGroups, elapsedUnit }) {
            super(panelElement);
            this.modeRadios = modeRadios;
            this.modeGroups = modeGroups;
            this.elapsedUnit = elapsedUnit;
            modeRadios.forEach((radio) => radio.addEventListener('change', () => this.#showModeInputs()));
            this.#showModeInputs();
        }

        get mode() {
            return this.modeRadios.find((radio) => radio.checked).value;
        }

        readExtras(reader) {
            if (this.mode === 'elapsed') {
                const value = reader.number('elapsedTime', { name: 'time interval' });
                return { elapsedSeconds: value === null ? null : timeToSeconds(value, this.elapsedUnit.value) };
            }
            return { time: reader.dateTime('specificTime', { name: 'specific date and time' }) };
        }

        compute(scenario, { time, elapsedSeconds }) {
            return scenario.activityAt(time || new Date(scenario.initial.time.getTime() + elapsedSeconds * 1000));
        }

        describeTime(result, scenario) {
            if (this.mode !== 'elapsed') return Format.dateTime(result.time);
            const sinceInitial = (result.time.getTime() - scenario.initial.time.getTime()) / 1000;
            return `${Format.dateTime(result.time)} (${Format.duration(sinceInitial)} after the initial measurement)`;
        }

        #showModeInputs() {
            this.modeGroups.forEach((group) => { group.hidden = group.dataset.specificMode !== this.mode; });
        }
    }

    class TimeToTargetCalculation extends Calculation {
        readExtras(reader, { units }) {
            const target = reader.number('targetActivity', { name: 'target activity', positive: true });
            return { targetActivity: target === null ? null : units.of('targetActivity').toBq(target) };
        }

        compute(scenario, { targetActivity }) {
            return scenario.timeToReach(targetActivity);
        }

        render({ time, elapsedSeconds, halfLives }, { scenario, unit, extras }) {
            const referenceName = referenceNameOf(scenario);
            const relative = Math.abs(elapsedSeconds) < 1e-3
                ? 'already at the target activity'
                : `${Format.duration(elapsedSeconds)} ${elapsedSeconds > 0 ? 'after' : 'before'} it ` +
                  `(${Format.number(Math.abs(halfLives))} half-lives)`;
            const timeText = `${Format.dateTime(time)}${pastNote(time)}`;

            this.panel.setSlot('time', timeText);
            this.panel.setSlot('reference-name', referenceName);
            this.panel.setSlot('relative', relative);
            const referenceText = this.renderReference(scenario, unit);

            this.summary = [
                `Target activity: ${activityText(extras.targetActivity, unit)}`,
                `Reached at: ${timeText}`,
                `Relative to the ${referenceName}: ${relative}`,
                referenceText,
            ].filter(Boolean);
        }
    }

    /** Dose drawing: the volume that holds the desired activity at administration time. */
    class DoseCalculation extends Calculation {
        dependsOnNow = true; // the expected reading "now" changes with the clock

        readExtras(reader, { units }) {
            const desired = reader.number('desiredActivity', { name: 'desired activity', positive: true });
            const desiredUnit = units.of('desiredActivity');
            return {
                desiredUnit,
                desiredActivity: desired === null ? null : desiredUnit.toBq(desired),
                time: reader.dateTime('administrationTime', { name: 'administration date and time' }),
            };
        }

        compute(scenario, { desiredActivity, time }) {
            return scenario.volumeFor(desiredActivity, time, new Date());
        }

        render(result, { scenario, unit, extras }) {
            const doseUnit = extras.desiredUnit;
            const readingLabel = `Expected Dose-Calibrator Reading Now (${Format.dateTime(result.readingTime)})`;
            const volumeText = `${Format.number(result.volumeMl)} mL`;
            const ofVial = `of ${Format.number(scenario.vial.totalMl)} mL in the vial`;
            const timeText = `${Format.dateTime(result.time)}${pastNote(result.time)}`;
            const note = result.time.getTime() < Date.now()
                ? 'The administration time is in the past; the expected reading is lower than the desired activity.'
                : '';

            this.panel.slot('groups').replaceChildren(
                createResultGroup('Volume to Draw', volumeText, [], ofVial),
                createActivityGroup('Activity at Administration', extras.desiredActivity, doseUnit),
                createActivityGroup(readingLabel, result.readingActivity, doseUnit),
                createActivityGroup('Vial Concentration at Administration', result.concentration, unit, perMlSuffix(unit)),
            );
            this.panel.setSlot('time', timeText);
            this.panel.setSlot('note', note);
            const referenceText = this.renderReference(scenario, unit);

            this.summary = [
                `Volume to draw: ${volumeText} (${ofVial})`,
                `Activity at administration: ${activityText(extras.desiredActivity, doseUnit)}`,
                `Administration: ${timeText}`,
                `${readingLabel}: ${activityText(result.readingActivity, doseUnit)}`,
                `Vial concentration at administration: ${activityText(result.concentration, unit, perMlSuffix(unit))}`,
                note,
                referenceText,
            ].filter(Boolean);
        }
    }

    /** A table of the activity at regular intervals; prints and copies (as tab-separated text). */
    class DecayTableCalculation extends Calculation {
        constructor(panelElement, { stepUnit, describeHalfLife }) {
            super(panelElement);
            this.stepUnit = stepUnit;
            this.describeHalfLife = describeHalfLife;
        }

        readExtras(reader) {
            const start = reader.dateTime('tableStart', { name: 'start date and time', required: false });
            const step = reader.number('tableStep', { name: 'interval', positive: true });
            const rows = reader.number('tableRows', { name: 'number of rows', positive: true });
            if (rows !== null && !Number.isInteger(rows)) {
                reader.fail('tableRows', 'Number of rows must be a whole number.');
            }
            return { start, rows, stepSeconds: step === null ? null : timeToSeconds(step, this.stepUnit.value) };
        }

        compute(scenario, { start, stepSeconds, rows }) {
            return scenario.schedule(start || scenario.reference.time, stepSeconds, rows);
        }

        render(rows, { scenario, unit }) {
            const otherBase = unit.baseUnit === 'Ci' ? 'Bq' : 'Ci';
            const columns = [
                { title: 'Date & Time', cell: (row) => Format.dateTime(row.time) },
                {
                    title: 'From Start',
                    cell: (row) => {
                        const seconds = (row.time - rows[0].time) / 1000;
                        return seconds === 0 ? '0' : `+${Format.shortDuration(seconds)}`;
                    },
                },
                { title: unit.isUnitless ? 'Activity' : `Activity (${unit.symbol})`, cell: (row) => Format.number(unit.fromBq(row.activity)) },
                !unit.isUnitless && { title: `Activity (${otherBase})`, cell: (row) => Format.activity(row.activity, otherBase) },
                { title: '% of Reference', cell: (row) => Format.percent(row.decayFactor) },
                scenario.vial && {
                    title: unit.isUnitless ? 'Concentration (per mL)' : `Concentration (${unit.symbol}/mL)`,
                    cell: (row) => Format.number(unit.fromBq(row.concentration)),
                },
            ].filter(Boolean);

            const now = Date.now();
            const stepMs = rows.length > 1 ? rows[1].time - rows[0].time : 0;
            const isCurrentRow = (row) => now >= row.time.getTime() && now < row.time.getTime() + stepMs;

            const headRow = createElement('tr');
            headRow.append(...columns.map((column) => {
                const th = createElement('th', null, column.title);
                th.scope = 'col';
                return th;
            }));
            this.panel.slot('head').replaceChildren(headRow);
            this.panel.slot('rows').replaceChildren(...rows.map((row) => {
                const tr = createElement('tr', isCurrentRow(row) ? 'is-now' : null);
                tr.append(...columns.map((column) => createElement('td', null, column.cell(row))));
                if (isCurrentRow(row)) tr.title = 'The current time falls in this row';
                return tr;
            }));

            const reference = scenario.reference;
            const caption = `${this.describeHalfLife()} · Reference: ` +
                `${scenario.usesResidual ? 'injected activity ' : ''}${Format.activityIn(reference.activity, unit)} ` +
                `at ${Format.dateTime(reference.time)}`;
            this.panel.setSlot('caption', caption);

            this.summary = [
                caption,
                columns.map((column) => column.title).join('\t'),
                ...rows.map((row) => columns.map((column) => column.cell(row)).join('\t')),
            ];
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
            this.units = new ActivityUnits(doc, ACTIVITY_FIELDS);

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
                specific: new SpecificTimeCalculation(byId('specificActivitySection'), {
                    modeRadios: [...doc.querySelectorAll('input[name="specificMode"]')],
                    modeGroups: [...doc.querySelectorAll('[data-specific-mode]')],
                    elapsedUnit: byId('elapsedUnit'),
                }),
                target: new TimeToTargetCalculation(byId('timeToTargetSection')),
                dose: new DoseCalculation(byId('doseSection')),
                table: new DecayTableCalculation(byId('tableSection'), {
                    stepUnit: byId('tableStepUnit'),
                    describeHalfLife: () => this.halfLife.describe(),
                }),
            };

            this.#bindEvents(byId);
            setInterval(() => this.#refreshClockDependentResults(), LIVE_UPDATE_INTERVAL_MS);
        }

        /** A calculate button was pressed: show that result and keep it live from now on. */
        request(calculation) {
            calculation.panel.activate();
            this.messages.hide();
            const problem = this.refresh().get(calculation);
            if (!problem) return;
            this.messages.show(problem.message, 'error');
            this.#revealField(problem.field);
        }

        /** Recomputes every active result. Returns a Map of calculation -> its first problem. */
        refresh() {
            const problems = new Map();
            const fieldErrors = new Map();

            for (const calculation of Object.values(this.calculations)) {
                if (!calculation.panel.isActive) continue;
                const errors = this.#run(calculation);
                if (errors.size === 0) continue;

                const [field, message] = errors.entries().next().value;
                problems.set(calculation, { field, message });
                errors.forEach((text, fieldName) => {
                    if (!fieldErrors.has(fieldName)) fieldErrors.set(fieldName, text);
                });
            }

            Object.entries(this.fields).forEach(([name, field]) => field.setError(fieldErrors.get(name)));

            // An error pop-up whose problem has since been fixed would be stale: remove it.
            const shownError = this.messages.visibleError;
            if (shownError && ![...problems.values()].some((problem) => problem.message === shownError)) {
                this.messages.hide();
            }
            return problems;
        }

        /** Runs one calculation and shows its result. Returns its errors (field -> message), if any. */
        #run(calculation) {
            const reader = new FormReader(this.fields);
            const inputs = this.#readSharedInputs(reader);
            const extras = calculation.readExtras(reader, { units: this.units });

            if (reader.isValid) {
                try {
                    const scenario = this.#buildScenario(inputs);
                    const unit = this.units.mainUnit;
                    calculation.render(calculation.compute(scenario, extras), { scenario, unit, extras });
                    calculation.context = { scenario, unit };
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

        #buildScenario({ initialActivity, halfLifeSeconds, initialTime, residual, vial }) {
            const units = this.units;
            return new DecayScenario({
                model: new DecayModel(halfLifeSeconds),
                initial: new Measurement(units.of('initialActivity').toBq(initialActivity), initialTime, 'initialActivity'),
                residual: residual && new Measurement(
                    units.of('residualActivity').toBq(residual.activity), residual.time, 'residualActivity'),
                vial: vial && new Vial(vial.totalMl, vial.partialMl),
            });
        }

        /** Opens a collapsed section when the problem is in one of its fields. */
        #revealField(fieldName) {
            const field = this.fields[fieldName];
            if (!field) return;
            const section = [this.residualSection, this.volumeSection]
                .find((toggle) => toggle.panel.contains(field.input));
            if (section && !section.isOpen) {
                section.toggle(true);
                field.input.focus();
            }
        }

        /** The text the Copy button puts on the clipboard: the inputs, then the result. */
        #copyTextFor(calculation) {
            const { scenario, unit } = calculation.context;
            const lines = [
                `Half-Life · Radioactive Decay Calculator (copied ${Format.dateTime(new Date())})`,
                `Half-life: ${this.halfLife.describe()}`,
                `Initial activity: ${Format.activityIn(scenario.initial.activity, unit)} at ${Format.dateTime(scenario.initial.time)}`,
            ];
            if (scenario.residual) {
                lines.push(`Residual activity: ${Format.activityIn(scenario.residual.activity, unit)} ` +
                    `at ${Format.dateTime(scenario.residual.time)}`);
            }
            if (scenario.vial) {
                const partial = scenario.vial.drawnMl === null ? '' : `, partial volume ${Format.number(scenario.vial.drawnMl)} mL`;
                lines.push(`Vial: ${Format.number(scenario.vial.totalMl)} mL total${partial}`);
            }
            const title = calculation.panel.section.querySelector('h3').textContent;
            return [...lines, '', title, ...calculation.summary].join('\n');
        }

        async #copy(button) {
            const calculation = Object.values(this.calculations)
                .find((candidate) => candidate.panel.section.contains(button));
            if (!calculation || !calculation.context) return;

            const copied = await copyToClipboard(this.#copyTextFor(calculation));
            const label = button.textContent;
            button.textContent = copied ? 'Copied ✓' : 'Copy failed';
            setTimeout(() => { button.textContent = label; }, 1500);
        }

        #print() {
            const root = document.documentElement;
            root.dataset.printing = 'table';
            const done = () => { delete root.dataset.printing; };
            window.addEventListener('afterprint', done, { once: true });
            window.print();
            setTimeout(done, 1000);
        }

        #bindEvents(byId) {
            const buttonTargets = {
                calculateButton: this.calculations.current,
                calculateSpecificButton: this.calculations.specific,
                calculateTimeToTargetButton: this.calculations.target,
                calculateDoseButton: this.calculations.dose,
                calculateTableButton: this.calculations.table,
            };
            Object.entries(buttonTargets).forEach(([id, calculation]) =>
                byId(id).addEventListener('click', () => this.request(calculation)));

            // Keep every requested result in step with the inputs.
            this.form.addEventListener('input', () => this.refresh());
            this.form.addEventListener('change', () => this.refresh());

            this.form.addEventListener('click', (event) => {
                const nowButton = event.target.closest('[data-now-for]');
                if (nowButton) {
                    const input = byId(nowButton.dataset.nowFor);
                    input.value = toDateTimeLocalValue(new Date());
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                const copyButton = event.target.closest('[data-copy]');
                if (copyButton) this.#copy(copyButton);
                if (event.target.closest('[data-print]')) this.#print();
            });

            // Enter in a field runs the calculation of the section the field is in.
            this.form.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' || !event.target.matches('input')) return;
                const section = event.target.closest('[data-enter-action]');
                byId(section ? section.dataset.enterAction : 'calculateButton').click();
            });
        }

        #refreshClockDependentResults() {
            if (document.visibilityState !== 'visible') return;
            Object.values(this.calculations)
                .filter((calculation) => calculation.dependsOnNow && calculation.panel.isVisible)
                .forEach((calculation) => this.#run(calculation));
        }
    }

    /** Copies text; falls back to a hidden textarea where the Clipboard API is unavailable. */
    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (clipboardUnavailable) {
            const textarea = createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.append(textarea);
            textarea.select();
            const copied = document.execCommand('copy');
            textarea.remove();
            return copied;
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
