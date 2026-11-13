/**
 * Half-Life — theme switching.
 *
 * Themes are CSS variable sets keyed on <html data-theme="...">, so switching
 * a theme is one attribute change. The inline script in <head> applies the
 * saved theme before the first paint; this file handles the switcher panel,
 * remembers the choice and runs the "radioactive" dot animation.
 */
(function (root) {
    'use strict';

    const { createElement } = root.HalfLife;

    /** localStorage that never throws (it can be blocked by privacy settings or sandboxing). */
    const safeStorage = {
        get(key) {
            try { return root.localStorage.getItem(key); } catch (blocked) { return null; }
        },
        set(key, value) {
            try { root.localStorage.setItem(key, value); } catch (blocked) { /* not persisted */ }
        },
    };

    /** Glowing dots scattered behind the calculator (radioactive theme only). */
    class DotField {
        constructor(container, { minDots = 50, maxDots = 200, pixelsPerDot = 7000 } = {}) {
            this.container = container;
            this.minDots = minDots;
            this.maxDots = maxDots;
            this.pixelsPerDot = pixelsPerDot;
            this.isRunning = false;
        }

        start() {
            if (this.isRunning || !this.container) return;

            const randomDot = () => {
                const dot = createElement('div', 'dot');
                dot.style.top = `${Math.random() * 100}%`;
                dot.style.left = `${Math.random() * 100}%`;
                dot.style.animationDelay = `${Math.random() * 4}s`;
                dot.style.animationDuration = `${2.5 + Math.random() * 2}s`;
                return dot;
            };

            const { width, height } = this.container.parentElement.getBoundingClientRect();
            const count = Math.min(this.maxDots,
                Math.max(this.minDots, Math.floor((width * height) / this.pixelsPerDot)));

            this.container.replaceChildren(...Array.from({ length: count }, randomDot));
            this.isRunning = true;
        }

        stop() {
            if (this.container) this.container.replaceChildren();
            this.isRunning = false;
        }
    }

    class ThemeManager {
        static THEMES = Object.freeze(['clean', 'radioactive']);
        static DEFAULT_THEME = 'clean';
        static STORAGE_KEY = 'selectedTheme';

        /**
         * @param {object} options
         * @param {HTMLElement} options.toggleButton  the gear button
         * @param {HTMLElement} options.panel         the theme picker panel
         * @param {DotField}    options.dotField      animation shown in the radioactive theme
         */
        constructor({ toggleButton, panel, dotField, documentElement = document.documentElement }) {
            this.root = documentElement;
            this.toggleButton = toggleButton;
            this.panel = panel;
            this.dotField = dotField;
            this.optionButtons = [...panel.querySelectorAll('[data-theme-option]')];

            this.#bindEvents();
            this.apply(this.root.dataset.theme || safeStorage.get(ThemeManager.STORAGE_KEY));
        }

        get current() {
            return this.root.dataset.theme;
        }

        get isOpen() {
            return !this.panel.hidden;
        }

        apply(theme) {
            const name = ThemeManager.THEMES.includes(theme) ? theme : ThemeManager.DEFAULT_THEME;
            this.root.dataset.theme = name;
            safeStorage.set(ThemeManager.STORAGE_KEY, name);

            this.optionButtons.forEach((button) =>
                button.setAttribute('aria-pressed', String(button.dataset.themeOption === name)));

            if (name === 'radioactive') this.dotField.start();
            else this.dotField.stop();
        }

        open() {
            this.panel.hidden = false;
            this.toggleButton.setAttribute('aria-expanded', 'true');
            const activeOption = this.optionButtons.find((button) => button.dataset.themeOption === this.current);
            (activeOption || this.optionButtons[0]).focus();
        }

        close({ returnFocus = true } = {}) {
            if (!this.isOpen) return;
            this.panel.hidden = true;
            this.toggleButton.setAttribute('aria-expanded', 'false');
            if (returnFocus) this.toggleButton.focus();
        }

        #bindEvents() {
            this.toggleButton.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));

            this.optionButtons.forEach((button) =>
                button.addEventListener('click', () => this.apply(button.dataset.themeOption)));

            this.panel.querySelector('[data-theme-close]').addEventListener('click', () => this.close());

            document.addEventListener('click', (event) => {
                const clickedOutside = !this.panel.contains(event.target) &&
                    !this.toggleButton.contains(event.target);
                if (this.isOpen && clickedOutside) this.close({ returnFocus: false });
            });

            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape') this.close();
            });
        }
    }

    root.HalfLife = Object.assign(root.HalfLife || {}, { DotField, ThemeManager, safeStorage });
})(globalThis);
