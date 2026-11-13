/**
 * Half-Life — reusable UI building blocks.
 *
 * Small classes that each own one piece of the page: a form field and its
 * error text, the pop-up message box, a show/hide section and a result panel.
 * None of them knows anything about radioactive decay.
 */
(function (root) {
    'use strict';

    const { parseDateTimeLocal } = root.HalfLife;

    /** Creates an element with an optional class and text. */
    function createElement(tag, className = null, text = null) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== null) element.textContent = text;
        return element;
    }

    const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

    /**
     * Equations are written in a tiny markup: "^{...}" is a superscript and
     * "_{...}" a subscript; they can nest, e.g. "(½)^{(t − t_{0}) / T_{½}}".
     * renderMath() turns it into text with <sup>/<sub> elements.
     */
    function renderMath(markup) {
        const fragment = document.createDocumentFragment();
        let position = 0;

        const parseInto = (parent, insideBraces) => {
            let text = '';
            const flushText = () => {
                if (text) parent.append(document.createTextNode(text));
                text = '';
            };
            while (position < markup.length) {
                const char = markup[position];
                if (insideBraces && char === '}') {
                    position += 1;
                    break;
                }
                if ((char === '^' || char === '_') && markup[position + 1] === '{') {
                    flushText();
                    position += 2;
                    const element = document.createElement(char === '^' ? 'sup' : 'sub');
                    parseInto(element, true);
                    parent.append(element);
                } else {
                    text += char;
                    position += 1;
                }
            }
            flushText();
        };

        parseInto(fragment, false);
        return fragment;
    }

    /** The same equation as plain text for copying: subscripts inline, superscripts as ^(...). */
    function mathToText(markup) {
        let text = markup;
        while (/_\{[^{}]*\}/.test(text)) text = text.replace(/_\{([^{}]*)\}/g, '$1');
        return text.replace(/\^\{/g, '^(').replace(/\}/g, ')');
    }

    /* ------------------------------------------------------------------ */

    /** An input together with the <p> that shows its error (id: `${inputId}Error`). */
    class Field {
        constructor(input, errorElement) {
            this.input = input;
            this.errorElement = errorElement;
        }

        static fromId(id, doc = document) {
            return new Field(doc.getElementById(id), doc.getElementById(`${id}Error`));
        }

        get text() {
            return this.input.value.trim();
        }

        /** True when the browser holds text it could not parse (e.g. "1e" in a number input). */
        get hasUnparsableText() {
            return Boolean(this.input.validity && this.input.validity.badInput);
        }

        get isEmpty() {
            return this.text === '' && !this.hasUnparsableText;
        }

        /** Shows `message` under the input, or clears it when empty. Untouched if unchanged. */
        setError(message = '') {
            if (this.errorElement && this.errorElement.textContent !== message) {
                this.errorElement.textContent = message;
            }
            if (message) this.input.setAttribute('aria-invalid', 'true');
            else this.input.removeAttribute('aria-invalid');
        }
    }

    /* ------------------------------------------------------------------ */

    /**
     * Reads typed values from a set of named Fields and collects every problem
     * instead of stopping at the first one, so all errors can be shown at once.
     */
    class FormReader {
        constructor(fields) {
            this.fields = fields;
            this.errors = new Map(); // field name -> message
        }

        get isValid() {
            return this.errors.size === 0;
        }

        /** Records a problem for `fieldName` (first message wins) and returns null. */
        fail(fieldName, message) {
            if (!this.errors.has(fieldName)) this.errors.set(fieldName, message);
            return null;
        }

        /**
         * @param {string} fieldName
         * @param {{name: string, positive?: boolean, required?: boolean}} rules
         *        `name` is the human wording used in messages, e.g. "initial activity".
         */
        number(fieldName, { name, positive = false, required = true }) {
            const field = this.fields[fieldName];
            if (field.hasUnparsableText) return this.fail(fieldName, `${capitalize(name)} must be a number.`);
            if (field.isEmpty) return required ? this.fail(fieldName, `Enter the ${name}.`) : null;

            const value = Number(field.text);
            if (!Number.isFinite(value)) return this.fail(fieldName, `${capitalize(name)} must be a finite number.`);
            if (positive && value <= 0) return this.fail(fieldName, `${capitalize(name)} must be greater than zero.`);
            if (value < 0) return this.fail(fieldName, `${capitalize(name)} cannot be negative.`);
            return value;
        }

        dateTime(fieldName, { name, required = true }) {
            const field = this.fields[fieldName];
            if (field.isEmpty) return required ? this.fail(fieldName, `Select the ${name}.`) : null;
            return parseDateTimeLocal(field.text) ||
                this.fail(fieldName, `${capitalize(name)} is not a valid date and time.`);
        }
    }

    /* ------------------------------------------------------------------ */

    /** The pop-up in the top-right corner. Errors stay until closed; other messages fade out. */
    class MessageBox {
        constructor(element, { autoHideMs = 6000 } = {}) {
            this.element = element;
            this.titleElement = element.querySelector('[data-message-title]');
            this.textElement = element.querySelector('[data-message-text]');
            this.autoHideMs = autoHideMs;
            this.hideTimer = null;

            element.querySelector('[data-message-close]').addEventListener('click', () => this.hide());
        }

        /** The error text currently on screen, or null. */
        get visibleError() {
            return !this.element.hidden && this.element.dataset.type === 'error'
                ? this.textElement.textContent
                : null;
        }

        show(message, type = 'error') {
            const titles = { error: 'Error', info: 'Info', success: 'Success' };
            this.element.dataset.type = type;
            this.titleElement.textContent = titles[type] || titles.info;
            this.textElement.textContent = message;
            this.element.hidden = false;

            clearTimeout(this.hideTimer);
            if (type !== 'error') {
                this.hideTimer = setTimeout(() => this.hide(), this.autoHideMs);
            }
        }

        hide() {
            clearTimeout(this.hideTimer);
            this.element.hidden = true;
        }
    }

    /* ------------------------------------------------------------------ */

    /** A button that shows and hides a panel, with labels for both states. */
    class ToggleSection {
        constructor(button, panel, { openLabel, closedLabel, onToggle = () => {} }) {
            this.button = button;
            this.panel = panel;
            this.openLabel = openLabel;
            this.closedLabel = closedLabel;
            this.onToggle = onToggle;

            button.addEventListener('click', () => this.toggle());
            this.#render();
        }

        get isOpen() {
            return !this.panel.hidden;
        }

        toggle(open = !this.isOpen) {
            this.panel.hidden = !open;
            this.#render();
            this.onToggle(open);
        }

        #render() {
            this.button.setAttribute('aria-expanded', String(this.isOpen));
            this.button.textContent = this.isOpen ? this.openLabel : this.closedLabel;
        }
    }

    /* ------------------------------------------------------------------ */

    /**
     * An output section. Once the user asks for it, it is "active": it is then
     * kept up to date as inputs change instead of showing a stale result.
     */
    class ResultPanel {
        constructor(section) {
            this.section = section;
            this.isActive = false;
        }

        get isVisible() {
            return !this.section.hidden;
        }

        activate() {
            this.isActive = true;
        }

        show() {
            this.section.hidden = false;
        }

        hide() {
            this.section.hidden = true;
        }

        /** The element marked data-slot="name" inside the panel. */
        slot(name) {
            return this.section.querySelector(`[data-slot="${name}"]`);
        }

        /** Sets a slot's text; a slot with no text is hidden. */
        setSlot(name, text) {
            const element = this.slot(name);
            if (!element) return;
            element.textContent = text || '';
            element.hidden = !text;
        }
    }

    root.HalfLife = Object.assign(root.HalfLife || {}, {
        createElement,
        renderMath,
        mathToText,
        Field,
        FormReader,
        MessageBox,
        ToggleSection,
        ResultPanel,
    });
})(globalThis);
