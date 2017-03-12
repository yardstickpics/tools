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

module.exports = class Metadata {
    constructor(options) {
        if (!options) options = {};

        this._root = options.root || 'metadata';

        if (!fs.existsSync(this._root)) {
            throw Error(`Expecting ${this._root}/ dir to exist. Please clone https://github.com/yardstickpics/metadata`);
        }

        this._paths = options.sha1s ? options.sha1s.map(sha1 => `${this._root}/${sha1.substr(0,2)}/${sha1.substr(2)}.json`) : undefined;
    }

    async findBySha1(sha1) {
        const path = `${this._root}/${sha1.substr(0,2)}/${sha1.substr(2)}.json`;
        const data = await readFile(path);
        return new Image(JSON.parse(data), path);
    }

    forEach(options, cb) {
        return this.map(options, cb).then(() => {});
    }

    async filter(options, cb) {
        const arr = await this.map(options, cb)
        return arr.filter(item => item);
    }

    async map(options, cb) {
        if ('function' === typeof options && !cb) {
            cb = options;
            options = {};
        }

        if ('object' !== typeof options) {
            throw Error("The first argument must be options object");
        }
        if ('function' !== typeof cb) {
            throw Error("The second argument must be a callback");
        }

        const allFiles = this._paths || glob(`${this._root}/[0-9a-f][0-9a-f]/*.json`);
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
                if (done2 > 8) do {
                    done2 /= 2;
                    total2 -= done2;
                    elapsed /= 2;
                    startTime += elapsed;
                } while(done2 > 100);
            }, 5000);
        }

        let aborted = false;
        function abort() {
            if (aborted) {
                process.exit(9);
            }
            console.warn("\nAborting…");
            aborted = true;
        }
        process.on('SIGINT', abort);

        const errorHandler = options.ignoreErrors ? () => {} : undefined;

        try {
            const res = await Promise.all(allFiles.map(path => {
                return q.add(() => {
                    if (aborted) return;
                    return readFile(path)
                        .then(data => cb(new Image(JSON.parse(data), path)))
                        .then(res => {done++;done2++; return res;}, errorHandler);
                });
            }));
            if (aborted) {
                throw Error("aborted");
            }
            return res;
        } catch(err) {
            aborted = true;
            throw err;
        } finally {
            process.removeListener('SIGINT', abort);
            clearInterval(progressTimer);
        }
    }
};
