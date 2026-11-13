#!/usr/bin/env node
/**
 * Cache busting: adds a content hash to every local CSS/JS address in
 * index.html, e.g. "js/app.js?v=3f2a9c1b7d".
 *
 *   npm run stamp
 *
 * GitHub Pages lets browsers keep files for 10 minutes. Without this, a
 * browser can combine a new index.html with an old cached app.js, and the new
 * features silently do nothing. With it, changed files get new addresses, so
 * the page always loads code from the same version. `npm test` fails if a
 * hash is out of date.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
/** src="js/x.js" or href="css/x.css", with or without an existing ?v= hash. */
const ASSET_REFERENCE = /((?:src|href)=")((?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[0-9a-f]*)?(")/g;

function hashOf(relativePath) {
    const content = fs.readFileSync(path.join(ROOT, relativePath));
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 10);
}

function stamp(html) {
    return html.replace(ASSET_REFERENCE, (match, before, file, after) => `${before}${file}?v=${hashOf(file)}${after}`);
}

if (require.main === module) {
    const html = fs.readFileSync(INDEX, 'utf8');
    const stamped = stamp(html);
    if (stamped === html) {
        console.log('index.html: asset hashes are already current.');
    } else {
        fs.writeFileSync(INDEX, stamped);
        console.log('index.html: asset hashes updated.');
    }
}

module.exports = { ASSET_REFERENCE, hashOf, stamp };
