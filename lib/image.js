'use strict';

const fs = require('fs');
const denodeify = require('denodeify');
const crypto = require('crypto');
const readFile = denodeify(fs.readFile);
const writeFile = denodeify(fs.writeFile);

const fieldOrder = ['sha1', 'lic', 'url', 'urls', 'ext', 'from', 'created', 'name', 'desc', 'tags', 'wiki'];

module.exports = class Image {
    constructor(data, metadataPath) {
        this.data = data;
        this._metadataPath = metadataPath;
    }

    json() {
        const newdata = {};
        for (const k of fieldOrder) {
            if (k in this.data) newdata[k] = this.data[k];
        }
        for (const k of Object.keys(this.data).sort()) {
            if (!(k in newdata)) newdata[k] = this.data[k];
        }
        return JSON.stringify(newdata, undefined, 1);
    }

    addTag(tag) {
        if (!this.data.tags) this.data.tags = [];
        if (-1 === this.data.tags.indexOf(tag)) {
            this.data.tags.unshift(tag); // JSON commas :(
            return true;
        }
        return false;
    }

    removeTag(tag) {
        if (!this.data.tags) return false;
        const l = this.data.tags.length;
        this.data.tags = this.data.tags.filter(t => t != tag);
        return l != this.data.tags.length;
    }

    save() {
        fs.writeFileSync(this.metadataPath(), this.json());
    }

    metadataPath() {
        if (!this._metadataPath) throw Error("Image wasn't created from an on-disk path");
        return this._metadataPath;
    }

    sourcePath() {
        const sha1 = this.data.sha1;
        return `downloads/${sha1.substr(0,2)}/${sha1.substr(2)}.${this.data.ext}`;
    }

    static _metaFromPath(imagePath) {
        const m = imagePath.match(/\.([a-z0-9_-]{1,5})$/i);
        const ext = m ? m[1].toLowerCase().replace(/^jpg$/, 'jpeg') : 'img';

        let name = decodeURI(imagePath.replace(/.*\//, '').replace(/\.([a-z0-9_-]{1,5})$/i, ''));
        if (!/ /.test(name)) {
            name = name.replace(/_/g, ' ');
        }
        if (!/[_ ]/.test(name)) {
            name = name.replace(/-/g, ' ');
        }
        return {
            name,
            ext
        };
    }

    static createFromFile(initialData, imagePath) {
        return readFile(imagePath).then(imageBuffer => {
            if (!initialData.ext || !initialData.name) {
                initialData = Object.assign(this._metaFromPath(imagePath), initialData);
            }
            return this.createFromBuffer(initialData, imageBuffer);
        });
    }

    static async createFromBuffer(initialData, imageBuffer) {
        if ('object' !== typeof initialData) throw Error("Please supply an object with properties");
        if (!initialData.lic) throw Error("Please supply an object with lic (license) property");
        if (!initialData.from && !initialData.url && !initialData.urls && !initialData.desc) throw Error("Please describe where the image came from: https://github.com/yardstickpics/metadata#schema");


        const sha1 = crypto.createHash('sha1').update(imageBuffer).digest('hex');
        const metadataPath = `metadata/${sha1.substr(0,2)}/${sha1.substr(2)}.json`;

        if (initialData.url && (!initialData.ext || !initialData.name)) {
            initialData = Object.assign(this._metaFromPath(initialData.url), initialData);
        }
        initialData = Object.assign({
            ext: 'img'
        }, initialData, {
            sha1
        });
        if (initialData.tags) {
            const tagsSeen = {};
            initialData.tags = initialData.tags.filter(t => {
                const seen = tagsSeen[t];
                tagsSeen[t] = true;
                return !seen;
            });
        }
        const image = new Image(initialData, metadataPath);

        try {
            fs.mkdirSync(`metadata/${sha1.substr(0,2)}`);
        } catch (e) {}
        try {
            fs.mkdirSync(`downloads/${sha1.substr(0,2)}`);
        } catch (e) {}

        image.save();
        await writeFile(image.sourcePath(), imageBuffer);
        return image;
    }
};
