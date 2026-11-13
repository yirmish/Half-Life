'use strict';

// index.html must reference every local CSS/JS file with its current content hash
// (see scripts/stamp-assets.js). If this fails: run `npm run stamp`.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { hashOf } = require('../scripts/stamp-assets.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="((?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=([0-9a-f]*))?"/g)];

test('index.html references the local CSS and JS files', () => {
    const files = references.map(([, file]) => file).sort();
    assert.deepEqual(files, [
        'css/base.css', 'css/themes.css',
        'js/app.js', 'js/decay-core.js', 'js/isotopes.js', 'js/theme.js', 'js/ui-components.js',
    ]);
});

test('every local CSS/JS reference carries its current content hash (run `npm run stamp` if not)', () => {
    for (const [, file, version] of references) {
        assert.equal(version, hashOf(file), `${file}: index.html has ?v=${version || '(none)'}`);
    }
});
