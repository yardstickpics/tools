'use strict';

const fs = require('fs');

const fieldOrder = ['sha1', 'lic', 'url', 'urls', 'ext', 'from', 'created', 'name', 'desc', 'tags', 'wiki'];

function Image(data, metadataPath) {
    this.data = data;
    this._metadataPath = metadataPath;
}

Image.prototype.json = function() {
    const newdata = {};
    for(const k of fieldOrder) {
        if (k in this.data) newdata[k] = this.data[k];
    }
    for(const k of Object.keys(this.data).sort()) {
        if (!(k in newdata)) newdata[k] = this.data[k];
    }
    return JSON.stringify(newdata, undefined, 1);
};

Image.prototype.addTag = function(tag) {
    if (!this.data.tags) this.data.tags = [];
    if (-1 === this.data.tags.indexOf(tag)) {
        this.data.tags.push(tag);
        return true;
    }
    return false;
};

Image.prototype.save = function() {
    fs.writeFileSync(this._metadataPath, this.json());
};

Image.prototype.sourcePath = function() {
    return this._metadataPath.replace(/^metadata\/(.*)\.json$/, `downloads/$1.${this.data.ext}`);
};


module.exports = Image;
