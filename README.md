# Yardstick image test suite tools

## `import.js`

Scans [`metadata/`](https://github.com/yardstickpics/metadata) and [`downloads/`](https://yardstick.pictures/#download)
directories to import all images into `images.db`.

## `lib/metadata.js`

Programmatic API for using the metadata. It's a class with following methods:

### `.map([options,] callback)`

Runs callback on every image's metadata. The callback gets an `Image` instance as an argument, and may return a `Promise` to perform asynchronous tasks.

Options are:

 * `progress` — boolean. If `true`, periodically log how many callbacks have been executed and how much time is estimated to finish.
 * `cpus` — integer. Number of tasks to run in parallel.

Returns a `Promise` for an array of results from all callbacks. If any callback throws or returns a `Promise` that fails, the whole `map` will be aborted.

### `.forEach([options,] callback)`

Same as `map`, but returns a `Promise` for `undefined`.

### `Image`

Image instance given to the callback has following properties/methods:

#### `.data`

Raw [`metadata`](https://github.com/yardstickpics/metadata).

#### `.sourcePath()`

Returns file path to the source image (e.g. "downloads/00/0000…0000.jpeg"). It'll return a path even if the file does not exist.

#### `.json()`

Returns stringified `.data`.

#### `.save()`

Writes `.data` to disk.

### Example

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

Iterate over all available images and file sizes of some of them:

```js
const fs = require('fs');
const Metadata = require('yr').Metadata;
const yr = new Metadata();

yr.map({
    progress: true,
}, image => {
    if (image.data.lic == "pd") {
        return fs.statSync(image.sourcePath()).size;
    }
}).then(allValues => {
    const sizes = allValues.filter(x => x); // Remove undefined values
    const sum = sizes.reduce((sum,x) => sum+x, 0);
    console.log("Average public domain image size in this set is", sum / sizes.length);
});
```
