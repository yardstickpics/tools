'use strict';

const fs = require('fs');
const crypto = require('crypto');
const yr = require('./lib/yr');

const Metadata = yr.Metadata;
const metadata = new Metadata();

(async function(){
    await metadata.forEach({progress: true, cpus:2}, image => {
        return new Promise(resolve => {
            const hash = crypto.createHash('sha1');
            const stream = fs.createReadStream(image.sourcePath());
            stream.on('data', d => hash.update(d));
            stream.on('error', err => {
                if (err.code !== 'ENOENT') {
                    console.error(image.sourcePath(), "# error", err);
                } else {
                    console.log(image.sourcePath(), "# missing");
                }
                resolve();
            });
            stream.on('end', () => {
                const sha1 = hash.digest('hex');
                if (sha1 != image.data.sha1) {
                    console.log(image.sourcePath(), "# invalid");
                }
                resolve();
            });
        });
    });
})()
.catch(err => {
    console.error((err && err.stack) || err);
});
