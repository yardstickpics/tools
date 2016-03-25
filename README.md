# Yardstick image test suite tools

Library that helps using and managing image metadata provided by [Yardstick Pictures](https://yardstick.pictures/).

Requires stable version of NodeJS and (optionally) ImageMagick. To get started:

    npm install --save yr
    git clone https://github.com/yardstickpics/metadata.git

## `import.js`

Scans [`metadata/`](https://github.com/yardstickpics/metadata#readme) and [`downloads/`](https://yardstick.pictures/#download)
directories to import all images into an sqlite database `images.db`.

## `Metadata`

Programmatic API for using/browsing the metadata. The class' constructor takes one option:

 * `sha1s` — optional array of SHA-1 hashes of images to interate. If this option is not provided, it iterates over all available images.

```js
const yr = require('yr');
const metadata = new yr.Metadata();
```

The class has following methods:

### `.map([options,] callback)`

Runs callback on every image's metadata. The callback gets an `Image` instance as an argument, and may return a `Promise` to perform asynchronous tasks.

Options are:

 * `progress` — boolean. If `true`, periodically log how many callbacks have been executed and how much time is estimated to finish.
 * `cpus` — integer. Number of tasks to run in parallel.
 * `max` — integer. Iterate only over this many images. Useful for testing tools on small samples.
 * `ignoreErrors` — boolean. By default if any callback throws or returns a `Promise` that fails, the whole `map` will be aborted.

Returns a `Promise` for an array of results from all callbacks.

#### Example

Iterate over all available images and file sizes of some of them:

```js
const fs = require('fs');
const Metadata = require('yr').Metadata;
const yr = new Metadata();

yr.map({progress: true}, image => {
    if (image.data.lic == "pd") {
        return fs.statSync(image.sourcePath()).size;
    }
}).then(allValues => {
    const sizes = allValues.filter(x => x); // Remove undefined values
    const sum = sizes.reduce((sum,x) => sum+x, 0);
    console.log("Average public domain image size in this set is", sum / sizes.length);
});
```

### `.forEach([options,] callback)`

Same as `map`, but returns a `Promise` for `undefined`.

#### Example

Iterate over all available images' metadata and put in any `.name` fields that may be missing:

```js
const Metadata = require('yr').Metadata;
const yr = new Metadata();

yr.forEach(image => {
    if (!image.data.name) {
        image.data.name = "Unnamed image";
        image.save();
    }
})
.catch(err => console.error(err));
```

### `Image`

Image instance given to the callback has following properties/methods:

#### `.data`

Raw [`metadata`](https://github.com/yardstickpics/metadata#readme).

#### `.sourcePath()`

Returns file path to the source image (e.g. "downloads/00/0000…0000.jpeg"). It'll return a path even if the file does not exist.

#### `.addTag(tag)`

Adds a tag to `.data.tags` and returns `true` if it's a new tag.

#### `.json()`

Returns stringified `.data`.

#### `.save()`

Writes `.data` to disk.
