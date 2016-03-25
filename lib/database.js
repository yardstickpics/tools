'use strict';

const co = require('co');
const sqlite = require('sqlite3');
const Queue = require('promise-queue');

exports.open = co.wrap(function*(options) {
    if (!options) options = {};

    const sqliteDb = yield new Promise((resolve, reject) => {
        const db = new sqlite.Database(options.filePath || 'images.db', err => {
            if (err) return reject(err);
            resolve(db);
        });
    });

    const db = new Database(sqliteDb);

    yield db.exec(`CREATE TABLE IF NOT EXISTS images(id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        sha1 TEXT UNIQUE NOT NULL,
        lic TEXT NOT NULL,
        size INTEGER,
        width INTEGER,
        height INTEGER,
        json TEXT NOT NULL)`);
    yield db.exec("CREATE TABLE IF NOT EXISTS tags(id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, name TEXT UNIQUE NOT NULL)");
    yield db.exec("CREATE TABLE IF NOT EXISTS image_tags(tag_id INTEGER NOT NULL, image_id INTEGER NOT NULL, PRIMARY KEY(image_id, tag_id))");
    yield db.exec("CREATE UNIQUE INDEX IF NOT EXISTS tags_by_tag ON image_tags(tag_id, image_id)");

    yield db.exec(`CREATE TABLE IF NOT EXISTS analyses(
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        json TEXT NOT NULL
    )`);
    yield db.exec("CREATE UNIQUE INDEX IF NOT EXISTS analysis_by_version ON analyses(name, version)");

    yield db.exec(`CREATE TABLE IF NOT EXISTS metrics(
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        url TEXT
    )`);
    yield db.exec("CREATE UNIQUE INDEX IF NOT EXISTS metrics_by_version ON metrics(name, version)");

    yield db.exec(`CREATE TABLE IF NOT EXISTS image_metrics(
        analysis_id INTEGER NOT NULL,
        image_id INTEGER NOT NULL,
        metric_id INTEGER NOT NULL,
        size INTEGER,
        value FLOAT NOT NULL,
        PRIMARY KEY(analysis_id, image_id, metric_id))`);

    return db;
});

function Database(db) {
    this.db = db;
    this.transactions = new Queue(1);
}

Database.prototype.transaction = function(cb) {
    return this.transactions.add(() => {
        return this.exec("BEGIN")
            .then(cb)
            .then(res => {
                return this.exec("COMMIT").then(() => res);
            }, err => {
                return this.exec("ROLLBACK").then(() => {throw err;});
            });
    })
};

Database.prototype.exec = function(query, args) {
    if (!args) args = [];

    return new Promise((resolve, reject) => {
        this.db.run(query, args, function(err) {
            if (err) reject(err); else resolve(this);
        });
    });
};

Database.prototype.get = function(query, args) {
    if (!args) args = [];

    return new Promise((resolve, reject) => {
        this.db.all(query, args, function(err, data) {
            if (err) reject(err); else resolve(data);
        });
    });
};

Database.prototype.get1 = function(query, args) {
    return this.get(query, args).then(res => res[0]);
};
