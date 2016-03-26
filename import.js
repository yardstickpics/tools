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

co(function*(){
    const db = yield yr.Database.open();
    yield metadata.forEach({progress: true}, image => {
        return putIntoDatabase(db, image);
    });
    yield metadata.forEach({progress: true}, image => {
        return addDimensions(db, image);
    });
})
.catch(err => {
    console.error((err && err.stack) || err);
});

function gatherImageMetadata(image) {
    return co(function*() {
        const path = image.sourcePath();
        const data = {
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

function addDimensions(db, image) {
    return gatherImageMetadata(image).then(data => {
        return db.transaction(() => {
            return db.exec("UPDATE images SET width = ?, height = ?, size = ? WHERE sha1 = ?",
                [data.width, data.height, data.size, image.data.sha1]);
        });
    });
}

function putIntoDatabase(db, image) {
    return db.transaction(co.wrap(function*() {
        const existing = yield db.get1("SELECT id FROM images WHERE sha1 = ?", [image.data.sha1]);
        const cols = [image.data.lic, image.json(), image.data.sha1];
        let id;
        if (existing) {
            id = existing.id;
            yield db.exec("UPDATE images SET lic = ?, json = ? WHERE sha1 = ?", cols);
        } else {
            id = (yield db.exec("INSERT INTO images(lic,json,sha1) VALUES(?,?,?)", cols)).lastID;
        }
        yield addTags(db, id, image.data.tags);
    }));
}

function addTags(db, id, tags) {
    if (!tags || !tags.length || !id) {
        return Promise.resolve();
    }

    return Promise.all(tags.map(tag => db.exec("INSERT OR IGNORE into tags(name) VALUES(?)", [tag])))
    .then(() => Promise.all(tags.map(tag => db.exec("INSERT OR IGNORE into image_tags(tag_id, image_id) VALUES((SELECT id FROM tags WHERE name=?), ?)", [tag, id]))));
}
