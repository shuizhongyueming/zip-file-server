import {BlobWriter, type Entry} from '@zip.js/zip.js'
import {configure, ZipReader, HttpReader} from '@zip.js/zip.js/lib/zip-no-worker-inflate.js'

interface Remote {
  name: string;
  zipUrl: string;
  prefix: string;
}

export interface ZipFileServerOptions {
  remotes: Remote[];
  fetch: typeof fetch;
  fallbackUrl: string;
}

export interface UrlResponse {
  url: string;
  onComplete: () => void;
}

// @ts-ignore
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
const iOSVersion = isIOS ? parseInt(navigator.userAgent.match(/OS (\d+)/)[1], 10) : 0

export class ZipFileServer {
  private remotes: Map<string, Remote>;
  private readonly fetch: typeof fetch;
  private zipCache = new Map<string, Promise<Entry[]>>();
  private readonly fallbackUrl: string;

  constructor(options: ZipFileServerOptions) {
    configure({ useWebWorkers: false });
    this.remotes = new Map(options.remotes.map((remote) => [remote.name, remote]));
    this.fetch = options.fetch;
    this.fallbackUrl = options.fallbackUrl.endsWith('/')
      ? options.fallbackUrl
      : `${options.fallbackUrl}/`;
  }

  async getData(filePath: string, init?: RequestInit): Promise<Response> {
    const headers = init?.headers || {};

    // only handle GET request with zip file
    if (init?.method && init?.method !== 'GET' && !this.isPathUrl(filePath)) {
      console.warn(`zip-file-server: not a GET request, so fallback to fetch: `, init.method, filePath);
      return this.fetch(filePath, init);
    }

    try {
      const entry = await this.getTargetEntry(filePath);
      if (entry) {
        return this.getResponse(filePath, entry, headers);
      }
    } catch (e) {
      console.error('zip-file-server: getData: Failed to get blob from zip file: ', filePath, e);
    }

    console.warn('zip-file-server: getData fallback to fetch for file: ', filePath);
    return this.fetch(filePath, init);
  }

  async getUrl(filePath: string): Promise<UrlResponse> {
    if (!this.isPathUrl(filePath)) {
      return {
        url: filePath,
        onComplete: () => {},
      };
    }

    const entry = await this.getTargetEntry(filePath);
    if (!entry) {
      console.warn('zip-file-server: getUrl: no matched entry found,  fallback to getFallbackUrl: ', filePath);
      return {
        url: this.getFallbackUrl(filePath),
        onComplete: () => {},
      };
    }

    try {
      const response = await this.getResponse(filePath, entry);
      const blob = await response.blob();

      if (blob) {
        const url = URL.createObjectURL(blob);
        return {
          url,
          onComplete: () => {
            URL.revokeObjectURL(url);
          },
        };
      }
    } catch(e) {
      console.error('zip-file-server: getUrl: Failed to get blob from zip file: ', filePath, e);
    }

    console.warn('zip-file-server: getUrl: fallback to getFallbackUrl: ', filePath);
    return {
      url: this.getFallbackUrl(filePath),
      onComplete: () => {},
    };
  }

  // Preload zip file based on name
  async preload(name: string): Promise<void> {
    const remote = this.remotes.get(name);
    if (!remote) {
      return console.error(`zip-file-server: Failed to preload zip file: ${name}, not found`);
    }
    await this.getZipEntries(remote.zipUrl);
  }

  // unload zip file based on name to free memory
  async unload(name: string): Promise<void> {
    const remote = this.remotes.get(name);
    if (!remote) {
      return console.error(`zip-file-server: Failed to unload zip file: ${name}, not found`);
    }
    this.zipCache.delete(remote.zipUrl);
  }

  addRemote(remote: Remote) {
    if (this.remotes.has(remote.name)) {
      throw new Error(`zip-file-server: remote ${remote.name} already exists`);
    }
    this.remotes.set(remote.name, remote);
  }

  private isPathUrl(url: string) {
    return !url.startsWith('blob:') && !url.startsWith('data:');
  }

  private getFallbackUrl(filePath: string): string {
    filePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    if (this.fallbackUrl) {
      return `${this.fallbackUrl}${filePath}`;
    }
    return filePath;
  }

  private async getBlob(url: string, entry: Entry, headers?: HeadersInit): Promise<Blob> {
    let writer: BlobWriter = new BlobWriter;

    return entry.getData(writer, {
      // iOS 15 requires a signal to be passed to
      // or it will throw an error: options.signal must be an AbortSignal
      signal: new AbortController().signal,
    });
  }

  private async getResponse(url: string, entry: Entry, headers?: HeadersInit): Promise<Response> {
    if (isIOS && iOSVersion < 16) {
      // iOS 15 and below does not support ReadableStream as response
      // which will return empty response for receiver
      const blob = await this.getBlob(url, entry, headers);
      return new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers,
      });
    }
    const stream = new TransformStream();
    entry.getData(stream.writable).then(() => { });
    return new Response(stream.readable, {
      status: 200,
      statusText: 'OK',
      headers,
    });
  }

  private async getTargetEntry(url: string): Promise<Entry | null> {
    // 找到对应的 remote sources
    const remote = this.getRemote(url);
    if (!remote) {
      console.log('zip-file-server: getTargetEntry has no remote for url: ', url);
      return null;
    }
    // 从 remote sources 中找到对应的 zipUrl
    const zipUrl = remote.zipUrl;
    const pathInZip = url.slice(remote.prefix.length);
    // 基于 zipUrl 从缓存或者远程服务器获取 zip
    try {
      const entries = await this.getZipEntries(zipUrl);
      return entries.find((entry) => entry.filename === pathInZip) || null;
    } catch (error) {
      console.error('zip-file-server: get entry failed: ', url, error);
      return null;
    }
  }

  private getRemote(url: string): Remote | null {
    for (const remote of this.remotes.values()) {
      if (url.startsWith(remote.prefix)) {
        return remote;
      }
    }
    return null;
  }

  private async fetchZipEntries(baseUrl: string): Promise<Entry[]> {
    try {
      let url = (new URL(baseUrl, location.href)).href;
      const reader = new ZipReader(new HttpReader(url, {
        useRangeHeader: false,
        // no need extra request to get content length
        preventHeadRequest: true,
        combineSizeEocd: false
      }));
      const entries: Entry[] = await reader.getEntries();
      reader.close().catch(err => {
        console.error('zip-file-server: getZip close reader failed: ', baseUrl, err)
      });
      return entries;
    } catch (e) {
      console.error('zip-file-server: getZip get entries failed: ', baseUrl, e)
      throw new Error(`Failed to get entries from zip: ${baseUrl}, ${e}`);
    }
  }

  private getZipEntries(baseUrl: string): Promise<Entry[]> {
    if (!this.zipCache.has(baseUrl)) {
      console.log('zip-file-server: getZip, has no cache, request it', baseUrl)
      this.zipCache.set(baseUrl, this.fetchZipEntries(baseUrl));
    }
    return this.zipCache.get(baseUrl)!;
  }
}
