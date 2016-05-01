'use strict';

const yr = require('./lib/yr');
const denodeify = require('denodeify');
const co = require('co');
const fs = require('fs');
const metadata = new yr.Metadata();
const execFile = denodeify(require('child_process').execFile);

metadata.forEach({progress: true, cpus:7}, co.wrap(function*(image) {
    if (image.data.ext == 'tiff') {
        const format = yield execFile("identify", [image.sourcePath()]).catch(() => '???');
        if (/CMYK/.test(format) || !/sRGB/.test(format)) {
            console.log("non-sRGB or damaged", image.sourcePath());
            return;
        }

        const tmpPath = `/tmp/${image.data.sha1}.png`;
        let newImage;
        try {
            yield execFile("convert", ['-define','png:compression-level=9', image.sourcePath(), tmpPath]);
            newImage = yield yr.Image.createFromFile(Object.assign({}, image.data, {ext:"png",converted:{
                from:image.data.sha1,
                op:`${image.data.ext} to png`,
            }}), tmpPath);
        } catch(err) {
            console.error("Error converting", image.sourcePath(), err.stack);
            return;
        }

        console.log("Converted from", image.sourcePath(), "to", newImage.sourcePath(),
            "Size", fs.statSync(image.sourcePath()).size, "to", fs.statSync(newImage.sourcePath()).size, image.data.from, image.data.tags && image.data.tags.join(' '));

        fs.unlinkSync(tmpPath);
        fs.unlinkSync(image.metadataPath());
    }
}))
.catch(err => console.error("Aborted", err.stack));
