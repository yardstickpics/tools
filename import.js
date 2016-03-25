'use strict';

const co = require('co');
const sqlite = require('sqlite3');
const Queue = require('promise-queue');
const denodeify = require('denodeify');
const fs = require('fs');
const readFile = denodeify(fs.readFile);
const stat = denodeify(fs.stat);
const getDimensionsSync = require('image-size');
const getDimensions = denodeify(getDimensionsSync);

const Yr = require('./lib/yr');
const yr = new Yr();

const dbQueue = new Queue(1);

co(function*(){
    const db = yield new Promise((resolve, reject) => {
        const db = new sqlite.Database('images.db', err => {
            if (err) return reject(err);
            resolve(db);
        });
    });

    yield dbExec(db, `CREATE TABLE IF NOT EXISTS images(id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        sha1 TEXT UNIQUE NOT NULL,
        lic TEXT NOT NULL,
        size INTEGER,
        width INTEGER,
        height INTEGER,
        json TEXT NOT NULL)`);
    yield dbExec(db, "CREATE TABLE IF NOT EXISTS tags(id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, name TEXT UNIQUE NOT NULL)");
    yield dbExec(db, "CREATE TABLE IF NOT EXISTS image_tags(tag_id INTEGER NOT NULL, image_id INTEGER NOT NULL, PRIMARY KEY(image_id, tag_id))");
    yield dbExec(db, "CREATE UNIQUE INDEX IF NOT EXISTS tags_by_tag ON image_tags(tag_id, image_id)");

    yield yr.forEach({
        progress: true,
    }, image => {
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
    return dbQueue.add(co.wrap(function*() {

        yield dbExec(db, "BEGIN");
        try {
            const existing = yield dbGet(db, "SELECT id FROM images WHERE sha1 = ?", [data.sha1]);
            let id;
            const cols = [data.lic, data.size, data.width, data.height, data.json, data.sha1];
            if (existing.length) {
                id = existing[0].id;
                yield dbExec(db, "UPDATE images SET lic=?, size=?, width=?, height=?, json=? WHERE sha1=?", cols);
            } else {
                const insert = yield dbExec(db, "INSERT INTO images(lic,size,width,height,json,sha1) VALUES(?,?,?,?,?,?,?)", cols);
                id = insert.lastID;
            }

            yield addTags(db, id, data.tags);
            yield dbExec(db, "COMMIT");
        }
        catch(err) {
            console.error((err && err.stack) || err);
            yield dbExec(db, "ROLLBACK");
        }
    }));
}

function addTags(db, id, tags) {
    if (!tags || !tags.length || !id) {
        return Promise.resolve();
    }

    return Promise.all(tags.map(tag => dbExec(db, "INSERT OR IGNORE into tags(name) VALUES(?)", [tag])))
    .then(() => Promise.all(tags.map(tag => dbExec(db, "INSERT OR IGNORE into image_tags(tag_id, image_id) VALUES((SELECT id FROM tags WHERE name=?), ?)", [tag, id]))));
}

function dbExec(db, query, args) {
    if (!args) args = [];

    return new Promise((resolve, reject) => {
        db.run(query, args, function(err) {
            if (err) reject(err); else resolve(this);
        });
    });
}

function dbGet(db, query, args) {
    if (!args) args = [];

    return new Promise((resolve, reject) => {
        db.all(query, args, function(err, data) {
            if (err) reject(err); else resolve(data);
        });
    });
}
