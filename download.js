'use strict';

const denodeify = require('denodeify');
const fs = require('fs');
const path = require('path');
const superagent = require('superagent');
const writeFile = denodeify(fs.writeFile);
const mkdirp = denodeify(require('mkdirp'));
const fsexists = denodeify(fs.exists, res => [null, res]);
const yr = require('./lib/yr');

const Metadata = yr.Metadata;
const metadata = new Metadata();

metadata.forEach({progress: true}, async function(image) {
    const relPath = image.sourcePath();
    const filePath = `./${relPath}`;
    const remoteURL = `https://yardstick.pictures/${encodeURI(relPath)}`;
    const exists = await fsexists(filePath);
    if (!exists) {
        const request = superagent.get(remoteURL);
        const ext = image.data.ext;
        const dirPath = path.dirname(filePath);
        const dirPromise = fsexists(dirPath).then(exists => {
            if (!exists) {
                return mkdirp(dirPath);
            }
        });

        // Don't compress already-compressed
        request.set('Accept-Encoding', (ext !== 'jpeg' && ext !== 'png') ? 'gzip' : 'identity');

        try {
            const res = await request;
            await dirPromise;
            await writeFile(filePath, res.body);
            console.log("Downloaded", filePath);
        } catch(err) {
            console.error("Could not download", remoteURL, `${err}`);
        }
    }
})
.catch(err => {
    console.error((err && err.stack) || err);
});
