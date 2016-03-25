'use strict';
require('promise.prototype.finally');

const Image = require('./image');
const glob = require('glob').sync;
const Queue = require('promise-queue');
const denodeify = require('denodeify');
const fs = require('fs');
const os = require('os');
const process = require('process');
const readFile = denodeify(fs.readFile);

function Metadata() {
    if (!fs.existsSync('metadata')) {
        throw Error("Expecting metadata/ dir");
    }
    if (!fs.existsSync('downloads')) {
        throw Error("Expecting downloads/ dir");
    }
}

Metadata.prototype.forEach = function(options, cb) {
    return this.map(options, cb).then(() => {});
};

Metadata.prototype.filter = function(options, cb) {
    return this.map(options, cb).then(arr => arr.filter(item => item));
};

Metadata.prototype.map = function(options, cb) {
    if ('function' === typeof options && !cb) {
        cb = options;
        options = {};
    }

    if ('object' !== typeof options) {
        return Promise.reject(Error("The first argument must be options object"));
    }
    if ('function' !== typeof cb) {
        return Promise.reject(Error("The second argument must be a callback"));
    }

    const allFiles = glob('metadata/??/*.json');
    if (options.max && allFiles.length > options.max) {
        allFiles.length = options.max;
    }

    const q = new Queue(options.cpus || (os.cpus().length + 1));

    let progressTimer, startTime = Date.now();
    let done = 0, done2 = 0;
    let total = allFiles.length, total2 = allFiles.length;
    if (options.progress) {
        progressTimer = setInterval(() => {
            let elapsed = Date.now() - startTime;
            const timeLeft = (total2 - done2) * elapsed/Math.max(1, done2);
            console.log(`${done}/${total} (${Math.round(done*100/total)}%). ETA ${Math.round(timeLeft/60000)}m${Math.round(timeLeft%60000/1000)}s`);

            // Estimate ETA based on ~8 to 100 most recent files
            if (done2 > 8) while(done2 > 100) {
                done2 /= 2;
                total2 -= done2;
                elapsed /= 2;
                startTime += elapsed;
            }
        }, 5000);
    }

    let aborted = false;
    function abort() {
        aborted = true;
    }
    process.on('SIGINT', abort);

    return Promise.all(allFiles.map(path => {
        return q.add(() => {
            if (aborted) return;
            return readFile(path)
                .then(data => cb(new Image(JSON.parse(data), path)))
                .then(res => {done++;done2++; return res;});
        });
    }))
    .catch(err => {
        aborted = true;
        throw err;
    })
    .then(res => {
        if (aborted) throw Error("aborted");
        return res;
    })
    .finally(() => {
        process.removeListener('SIGINT', abort);
        clearInterval(progressTimer);
    });
};

module.exports = Metadata;
