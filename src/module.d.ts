declare module '@zip.js/zip.js/lib/zip-no-worker-inflate.js' {
  import {type Configuration} from "@zip.js/zip.js";

  export function configure(configuration: Configuration): void;
  export {ZipReader, BlobWriter, BlobReader, HttpReader} from "@zip.js/zip.js";
}