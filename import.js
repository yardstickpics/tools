'use strict';

const denodeify = require('denodeify');
const fs = require('fs');
const readFile = denodeify(fs.readFile);
const stat = denodeify(fs.stat);
const getDimensionsSync = require('image-size');
const getDimensions = denodeify(getDimensionsSync);
const yr = require('./lib/yr');

const Metadata = yr.Metadata;
const metadata = new Metadata();

(async function(){
    const db = await yr.Database.open();
    await metadata.forEach({progress: true}, image => {
        return putIntoDatabase(db, image);
    });
    console.log("Adding dimensions");
    await metadata.forEach({progress: true}, image => {
        return addDimensions(db, image);
    });
})()
.catch(err => {
    console.error((err && err.stack) || err);
});

async function gatherImageMetadata(image) {
    const path = image.sourcePath();
    const data = {};

    try {
        data.size = (await stat(path)).size;
    } catch(err) {
        console.log(path, "is missing");
        return data;
    }

    try {
        let dimensions;
        try {
            dimensions = await getDimensions(path);
        } catch(err) {
            // image-size gets buffer too small for JPEGs with color profiles
            dimensions = getDimensionsSync(await readFile(path));
        }
        data.width = dimensions.width;
        data.height = dimensions.height;
    } catch(err) {
        console.log("can't get dimensions of", path);
    }

    return data;
}

async function addDimensions(db, image) {
    const found = await db.get1("SELECT sha1 FROM images WHERE sha1 = ? AND width IS NULL", [image.data.sha1]);
    if (found) {
        const data = await gatherImageMetadata(image);
        return db.transaction(() => {
            return db.exec("UPDATE images SET width = ?, height = ?, size = ? WHERE sha1 = ?",
                [data.width, data.height, data.size, image.data.sha1]);
        });
    }
}

function putIntoDatabase(db, image) {
    return db.transaction(async function() {
        const existing = await db.get1("SELECT id FROM images WHERE sha1 = ?", [image.data.sha1]);
        const cols = [image.data.lic, image.json(), image.data.sha1];
        let id;
        if (existing) {
            id = existing.id;
            await db.exec("UPDATE images SET lic = ?, json = ? WHERE sha1 = ?", cols);
        } else {
            id = (await db.exec("INSERT INTO images(lic,json,sha1) VALUES(?,?,?)", cols)).lastID;
        }
        await addTags(db, id, image.data.tags);
    });
}

async function addTags(db, id, tags) {
    if (!tags || !tags.length || !id) {
        return;
    }

    await Promise.all(tags.map(tag => db.exec("INSERT OR IGNORE into tags(name) VALUES(?)", [tag])));
    await Promise.all(tags.map(tag => db.exec("INSERT OR IGNORE into image_tags(tag_id, image_id) VALUES((SELECT id FROM tags WHERE name=?), ?)", [tag, id])));
}
