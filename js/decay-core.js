/**
 * Half-Life — calculation core.
 *
 * Pure logic with no DOM access: units, the decay law, the residual/volume
 * scenario and number formatting. Runs in the browser (exposed on
 * `window.HalfLife`) and in Node (`require`), which is what the unit tests use.
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

    /* ------------------------------------------------------------------ */
    /* Errors                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * A problem with what the user entered. `field` names the input it belongs to
     * (e.g. 'residualActivity'), so the UI can show the message next to it.
     */
    class InputError extends Error {
        constructor(field, message) {
            super(message);
            this.name = 'InputError';
            this.field = field;
        }
    }

    /* ------------------------------------------------------------------ */
    /* Time                                                                */
    /* ------------------------------------------------------------------ */

    const SECONDS_PER_DAY = 86400;

    /** Seconds per time unit. */
    const TIME_UNITS = Object.freeze({
        seconds: 1,
        minutes: 60,
        hours: 3600,
        days: SECONDS_PER_DAY,
        // Julian year (365.25 d), the convention of nuclear-data tables such as NNDC.
        // (A 365-day year makes every half-life typed in years 0.07% too short.)
        years: 365.25 * SECONDS_PER_DAY,
    });

    function timeToSeconds(value, unit) {
        const secondsPerUnit = TIME_UNITS[unit];
        if (secondsPerUnit === undefined) {
            throw new RangeError(`Unknown time unit "${unit}".`);
        }
        return value * secondsPerUnit;
    }

    /** Expresses a duration in the largest unit in which it is at least 1. */
    function toBestTimeUnit(seconds) {
        const magnitude = Math.abs(seconds);
        const largestFirst = Object.entries(TIME_UNITS).sort((a, b) => b[1] - a[1]);
        const [unit, secondsPerUnit] =
            largestFirst.find(([, perUnit]) => magnitude >= perUnit) || ['seconds', 1];
        return { value: seconds / secondsPerUnit, unit };
    }

    /**
     * Parses the value of an <input type="datetime-local"> ("YYYY-MM-DDTHH:MM[:SS]")
     * as local time. Built from components, so no browser can read it as UTC.
     * Returns null for an empty or malformed value.
     */
    function parseDateTimeLocal(text) {
        const match = /^(\d{4,6})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
            .exec(String(text || '').trim());
        if (!match) return null;

        const [year, month, day, hour, minute, second] = match.slice(1, 7).map((part) => Number(part || 0));
        const millisecond = Number((match[7] || '0').padEnd(3, '0'));

        // setFullYear avoids the Date constructor's mapping of years 0-99 to 1900-1999.
        const date = new Date(2000, 0, 1);
        date.setFullYear(year, month - 1, day);
        date.setHours(hour, minute, second, millisecond);

        // Rejects impossible dates such as Feb 30 (which Date would roll over to March).
        // A time inside a DST gap is shifted by an hour by the browser and still accepted.
        const isRealDay = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
        return isRealDay && hour < 24 && minute < 60 && second < 60 ? date : null;
    }

    /** Formats a Date as a datetime-local input value (local time, with seconds). */
    function toDateTimeLocalValue(date) {
        const pad = (n) => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
            `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    /* ------------------------------------------------------------------ */
    /* Activity units                                                      */
    /* ------------------------------------------------------------------ */

    /** Becquerels in one base unit. 1 Ci = 3.7e10 Bq exactly; 1 Rd (rutherford) = 1e6 Bq. */
    const BQ_PER_BASE_UNIT = Object.freeze({ Bq: 1, Ci: 3.7e10, Rd: 1e6 });
    const BASE_UNITS = Object.freeze(Object.keys(BQ_PER_BASE_UNIT));

    /** SI prefixes, largest first. 'µ' is U+00B5 (micro sign), as used in the unit menu. */
    const SI_PREFIXES = Object.freeze([
        ['T', 1e12], ['G', 1e9], ['M', 1e6], ['k', 1e3], ['', 1],
        ['m', 1e-3], ['µ', 1e-6], ['n', 1e-9], ['p', 1e-12],
    ]);

    /** Units offered in the activity unit menu. */
    const SELECTABLE_ACTIVITY_UNITS = Object.freeze(
        ['Bq', 'kBq', 'MBq', 'GBq', 'TBq', 'nCi', 'µCi', 'mCi', 'Ci', 'Rd']
    );

    /** An activity unit such as "MBq" or "mCi", or the "no unit" choice. */
    class ActivityUnit {
        constructor(symbol, baseUnit, bqPerUnit) {
            this.symbol = symbol;
            this.baseUnit = baseUnit;
            this.bqPerUnit = bqPerUnit;
            Object.freeze(this);
        }

        /** '' means "no unit": numbers are used as they are and nothing is converted. */
        static parse(symbol) {
            if (!symbol) return ActivityUnit.NONE;

            for (const [prefix, multiplier] of SI_PREFIXES) {
                if (!symbol.startsWith(prefix)) continue;
                const base = symbol.slice(prefix.length);
                if (BASE_UNITS.includes(base)) {
                    return new ActivityUnit(symbol, base, multiplier * BQ_PER_BASE_UNIT[base]);
                }
            }
            throw new RangeError(`Unknown activity unit "${symbol}".`);
        }

        get isUnitless() {
            return this.baseUnit === null;
        }

        toBq(value) {
            return value * this.bqPerUnit;
        }

        fromBq(bq) {
            return bq / this.bqPerUnit;
        }
    }
    ActivityUnit.NONE = new ActivityUnit('', null, 1);

    /* ------------------------------------------------------------------ */
    /* Physics                                                             */
    /* ------------------------------------------------------------------ */

    /** The decay law A(t) = A0 · (1/2)^(t / T½) for one half-life. */
    class DecayModel {
        constructor(halfLifeSeconds) {
            if (!(Number.isFinite(halfLifeSeconds) && halfLifeSeconds > 0)) {
                throw new InputError('halfLife', 'Half-life must be a positive number.');
            }
            this.halfLifeSeconds = halfLifeSeconds;
            Object.freeze(this);
        }

        halfLivesIn(elapsedSeconds) {
            return elapsedSeconds / this.halfLifeSeconds;
        }

        /** Fraction of activity left after `elapsedSeconds` (above 1 for negative times). */
        decayFactor(elapsedSeconds) {
            return Math.pow(0.5, this.halfLivesIn(elapsedSeconds));
        }

        activityAfter(activity, elapsedSeconds) {
            return activity * this.decayFactor(elapsedSeconds);
        }

        /** Seconds for `fromActivity` to decay to `toActivity` (negative if it must grow). */
        timeToDecay(fromActivity, toActivity) {
            return this.halfLifeSeconds * Math.log2(fromActivity / toActivity);
        }
    }

    /** An activity (in Bq, or a plain number when no unit is used) measured at a moment. */
    class Measurement {
        constructor(activity, time, field = 'initialActivity') {
            if (!(Number.isFinite(activity) && activity >= 0)) {
                throw new InputError(field, 'Activity must be a non-negative number.');
            }
            if (!(time instanceof Date) || Number.isNaN(time.getTime())) {
                throw new InputError(field, 'Measurement time is invalid.');
            }
            this.activity = activity;
            this.time = time;
            Object.freeze(this);
        }

        secondsUntil(time) {
            return (time.getTime() - this.time.getTime()) / 1000;
        }
    }

    /** A total volume, optionally with the part of it that was drawn. Volumes in mL. */
    class Vial {
        constructor(totalMl, drawnMl = null) {
            if (!(Number.isFinite(totalMl) && totalMl > 0)) {
                throw new InputError('totalVolume', 'Total volume must be a positive number.');
            }
            if (drawnMl !== null) {
                if (!(Number.isFinite(drawnMl) && drawnMl > 0)) {
                    throw new InputError('partialVolume', 'Partial volume must be a positive number.');
                }
                if (drawnMl > totalMl) {
                    throw new InputError('partialVolume', 'Partial volume cannot exceed the total volume.');
                }
            }
            this.totalMl = totalMl;
            this.drawnMl = drawnMl;
            Object.freeze(this);
        }

        concentration(activity) {
            return activity / this.totalMl;
        }

        drawnActivity(activity) {
            return this.drawnMl === null ? null : this.concentration(activity) * this.drawnMl;
        }
    }

    /**
     * Everything the user described: the decay model, the initial measurement and,
     * optionally, a residual measurement (activity left in the syringe after
     * injection) and a vial volume.
     *
     * With a residual, the reference point becomes the injected activity at the
     * residual time: A_injected = A0 decayed to t_residual − A_residual. Because
     * decay is linear, decaying that difference forward is exact.
     */
    class DecayScenario {
        constructor({ model, initial, residual = null, vial = null }) {
            this.model = model;
            this.initial = initial;
            this.residual = residual;
            this.vial = vial;
            this.reference = residual ? this.#injectedActivity(residual) : initial;
            Object.freeze(this);
        }

        get usesResidual() {
            return this.residual !== null;
        }

        #injectedActivity(residual) {
            const elapsed = this.initial.secondsUntil(residual.time);
            if (elapsed < 0) {
                throw new InputError('residualTime',
                    'Residual measurement cannot be earlier than the initial measurement.');
            }
            const decayedInitial = this.model.activityAfter(this.initial.activity, elapsed);
            if (residual.activity > decayedInitial) {
                throw new InputError('residualActivity',
                    'Residual activity is higher than the initial activity decayed to the residual time.');
            }
            return new Measurement(decayedInitial - residual.activity, residual.time);
        }

        /** Activity (and derived quantities) at `time`. */
        activityAt(time) {
            const elapsedSeconds = this.reference.secondsUntil(time);
            const decayFactor = this.model.decayFactor(elapsedSeconds);
            const activity = this.reference.activity * decayFactor;

            return {
                time,
                elapsedSeconds,
                halfLives: this.model.halfLivesIn(elapsedSeconds),
                decayFactor,
                activity,
                concentration: this.vial ? this.vial.concentration(activity) : null,
                drawnActivity: this.vial ? this.vial.drawnActivity(activity) : null,
            };
        }

        /** When the activity equals `targetActivity` (which may be before the reference). */
        timeToReach(targetActivity) {
            if (!(Number.isFinite(targetActivity) && targetActivity > 0)) {
                throw new InputError('targetActivity', 'Target activity must be a positive number.');
            }
            if (this.reference.activity <= 0) {
                throw new InputError('targetActivity', this.usesResidual
                    ? 'The injected activity is zero, so no positive target can be reached.'
                    : 'The initial activity is zero, so no positive target can be reached.');
            }
            const elapsedSeconds = this.model.timeToDecay(this.reference.activity, targetActivity);
            return {
                elapsedSeconds,
                halfLives: this.model.halfLivesIn(elapsedSeconds),
                time: new Date(this.reference.time.getTime() + elapsedSeconds * 1000),
            };
        }
    }

    /* ------------------------------------------------------------------ */
    /* Formatting                                                          */
    /* ------------------------------------------------------------------ */

    const Format = Object.freeze({
        /** A plain number with sensible precision at any magnitude (never "0.000" for 0.0004). */
        number(value) {
            if (!Number.isFinite(value)) return 'N/A';
            if (value === 0) return '0';
            const magnitude = Math.abs(value);
            if (magnitude >= 1e7 || magnitude < 1e-3) return value.toExponential(3);
            return magnitude >= 1 ? value.toFixed(3) : value.toPrecision(4);
        },

        /** An activity in Bq shown in `baseUnit`, with the SI prefix that keeps it in [1, 1000). */
        activity(bq, baseUnit) {
            if (!Number.isFinite(bq)) return 'N/A';
            const value = bq / BQ_PER_BASE_UNIT[baseUnit];
            if (value === 0) return `0.000 ${baseUnit}`;

            const magnitude = Math.abs(value);
            const roundedIn = (factor) => Number((magnitude / factor).toFixed(3));
            const fitsFrom = (lowest) => ([, factor]) =>
                roundedIn(factor) >= lowest && roundedIn(factor) < 1000;

            const prefix = SI_PREFIXES.find(fitsFrom(1)) || SI_PREFIXES.find(fitsFrom(0.001));
            if (!prefix) return `${value.toExponential(3)} ${baseUnit}`;

            const [symbol, factor] = prefix;
            return `${(value / factor).toFixed(3)} ${symbol}${baseUnit}`;
        },

        /** An activity in the unit the user picked, e.g. "0.5000 mCi". */
        activityIn(bq, unit) {
            const number = Format.number(unit.fromBq(bq));
            return unit.isUnitless ? number : `${number} ${unit.symbol}`;
        },

        /** The same activity in the other base units, e.g. for MBq: ["500.000 µCi", "18.500 Rd"]. */
        equivalents(bq, unit) {
            if (unit.isUnitless) return [];
            return BASE_UNITS
                .filter((base) => base !== unit.baseUnit)
                .map((base) => Format.activity(bq, base));
        },

        /** A non-negative duration in its best unit, e.g. "2.000 days". */
        duration(seconds) {
            const magnitude = Math.abs(seconds);
            if (magnitude === 0) return '0 seconds';
            if (magnitude < 1e-3) return `${magnitude.toExponential(2)} seconds`;
            const { value, unit } = toBestTimeUnit(magnitude);
            return `${value.toFixed(3)} ${unit}`;
        },

        /** A half-life for menus, e.g. "6.006 h". */
        halfLife(seconds) {
            const abbreviations = { seconds: 's', minutes: 'min', hours: 'h', days: 'd', years: 'y' };
            const { value, unit } = toBestTimeUnit(seconds);
            return `${Number(value.toPrecision(4))} ${abbreviations[unit]}`;
        },

        percent(fraction) {
            const percent = fraction * 100;
            if (percent !== 0 && Math.abs(percent) < 0.01) return `${percent.toExponential(2)}%`;
            return `${percent.toFixed(2)}%`;
        },

        /** Local date and time with seconds, 24-hour clock. */
        dateTime(date) {
            if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
                return 'outside the representable calendar range';
            }
            return date.toLocaleString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
            });
        },
    });

    return {
        InputError,
        TIME_UNITS,
        timeToSeconds,
        toBestTimeUnit,
        parseDateTimeLocal,
        toDateTimeLocalValue,
        BQ_PER_BASE_UNIT,
        BASE_UNITS,
        SELECTABLE_ACTIVITY_UNITS,
        ActivityUnit,
        DecayModel,
        Measurement,
        Vial,
        DecayScenario,
        Format,
    };
});
