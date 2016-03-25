'use strict';

const denodeify = require('denodeify');
const co = require('co');
const fs = require('fs');
const readFile = denodeify(fs.readFile);
const stat = denodeify(fs.stat);
const getDimensionsSync = require('image-size');
const getDimensions = denodeify(getDimensionsSync);
const yr = require('./lib/yr');

const Metadata = yr.Metadata;
const metadata = new Metadata();

yr.Database.open().then(db => {
    return metadata.forEach({progress: true}, image => {
        return gatherImageMetadata(image)
            .then(data => putIntoDatabase(db, data));
    });
})
.catch(err => {
    console.error((err && err.stack) || err);
});

function gatherImageMetadata(image) {
    return co(function*() {
        const path = image.sourcePath();
        const data = {
            json: image.json(),
            lic: image.data.lic,
            tags: image.data.tags,
            sha1: image.data.sha1,
        };

        try {
            data.size = (yield stat(path)).size;
        } catch(err) {
            console.log(path, "is missing");
            return data;
        }

        try {
            let dimensions;
            try {
                dimensions = yield getDimensions(path);
            } catch(err) {
                // image-size gets buffer too small for JPEGs with color profiles
                dimensions = getDimensionsSync(yield readFile(path));
            }
            data.width = dimensions.width;
            data.height = dimensions.height;
        } catch(err) {
            console.log("can't get dimensions of", path);
        }

        return data;
    });
}

function putIntoDatabase(db, data) {
    return db.transaction(co.wrap(function*() {
        const existing = yield db.get1("SELECT id FROM images WHERE sha1 = ?", [data.sha1]);
        let id;
        const cols = [data.lic, data.size, data.width, data.height, data.json, data.sha1];
        if (existing) {
            id = existing.id;
            yield db.exec("UPDATE images SET lic=?, size=?, width=?, height=?, json=? WHERE sha1=?", cols);
        } else {
            const insert = yield db.exec("INSERT INTO images(lic,size,width,height,json,sha1) VALUES(?,?,?,?,?,?,?)", cols);
            id = insert.lastID;
        }
        yield addTags(db, id, data.tags);
    }));
}

function addTags(db, id, tags) {
    if (!tags || !tags.length || !id) {
        return Promise.resolve();
    }

    return Promise.all(tags.map(tag => db.exec("INSERT OR IGNORE into tags(name) VALUES(?)", [tag])))
    .then(() => Promise.all(tags.map(tag => db.exec("INSERT OR IGNORE into image_tags(tag_id, image_id) VALUES((SELECT id FROM tags WHERE name=?), ?)", [tag, id]))));
}
