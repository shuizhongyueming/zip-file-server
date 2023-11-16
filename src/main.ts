import {configure, Entry, ZipReader, BlobWriter, BlobReader} from '@zip.js/zip.js/lib/zip-no-worker-inflate.js'

interface Remote {
  zipUrl: string;
  prefix: string;
}

interface ZipServerOptions {
  remotes: Remote[];
  fetch: typeof fetch;
  fallbackUrl?: string;
}

interface UrlResponse {
  url: string;
  onComplete: () => void;
}

export class ZipServer {
  static SuffixMapContentType = {
    FORM_URLENCODED: 'application/x-www-form-urlencoded',
    GIF: 'image/gif',
    JPEG: 'image/jpeg',
    DDS: 'image/dds',
    JSON: 'application/json',
    PNG: 'image/png',
    TEXT: 'text/plain',
    XML: 'application/xml',
    WAV: 'audio/x-wav',
    OGG: 'audio/ogg',
    MP3: 'audio/mpeg',
    MP4: 'audio/mp4',
    AAC: 'audio/aac',
    BIN: 'application/octet-stream',
    BASIS: 'image/basis',
  };

  private remotes: Remote[];
  private fetch: typeof fetch;
  private zipCache = new Map<string, Promise<Entry[]>>();
  private fallbackUrl?: string;

  constructor(options: ZipServerOptions) {
    configure({ useWebWorkers: false });
    this.remotes = options.remotes;
    this.fetch = options.fetch;
    this.fallbackUrl = options.fallbackUrl.endsWith('/')
      ? options.fallbackUrl
      : `${options.fallbackUrl}/`;
  }

  async getData(filePath: string, headers?: HeadersInit): Promise<Response> {
    const blob = await this.getBlob(filePath, headers);
    if (blob) {
      return new Response(blob, {
        status: 200,
        statusText: 'OK',
        headers,
      });
    }

    return this.fetch(filePath, {
      headers,
    });
  }

  async getUrl(filePath: string): Promise<UrlResponse> {
    const blob = await this.getBlob(filePath);

    if (blob) {
      const url = URL.createObjectURL(blob);
      return {
        url,
        onComplete: () => {
          URL.revokeObjectURL(url);
        },
      };
    }

    return {
      url: this.getFallbackUrl(filePath),
      onComplete: () => {},
    };
  }

  private getFallbackUrl(filePath: string): string {
    filePath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    if (this.fallbackUrl) {
      return `${this.fallbackUrl}${filePath}`;
    }
    return filePath;
  }

  private async getBlob(url: string, headers?: HeadersInit): Promise<Blob | null> {
    const entry = await this.getTargetEntry(url);

    if (entry) {
      let writer: BlobWriter;
      if (headers?.['content-type']) {
        writer = this.getWriterBasedOnContentType(headers['content-type']);
      } else {
        writer = this.getWriterBasedOnUrl(url);
      }
      return entry.getData(writer);
    }
    return null;
  }

  private getWriterBasedOnUrl(url: string): BlobWriter {
    const mimeType = this.getMimeTypeFromUrl(url);
    return new BlobWriter(mimeType);
  }

  private getSuffixFromUrl(url: string): string {
    const suffix = url.split('?').pop().split('.').pop();
    return suffix ? suffix.toLowerCase() : '';
  }

  private getMimeTypeFromUrl(url: string): string {
    const suffix = this.getSuffixFromUrl(url);
    return ZipServer.SuffixMapContentType[suffix] || 'application/octet-stream';
  }

  private getWriterBasedOnContentType(contentType: string): BlobWriter {
    const mimeType = contentType.split(';')[0];
    return new BlobWriter(mimeType);
  }

  private async getTargetEntry(url: string): Promise<Entry | null> {
    // 找到对应的 remote sources
    const remote = this.getRemote(url);
    if (!remote) {
      return null;
    }
    // 从 remote sources 中找到对应的 zipUrl
    const zipUrl = remote.zipUrl;
    const pathInZip = url.slice(remote.prefix.length);
    // 基于 zipUrl 从缓存或者远程服务器获取 zip
    try {
      const entries = await this.getZip(zipUrl);
      return entries.find((entry) => entry.filename === pathInZip) || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  private getRemote(url: string): Remote | null {
    return this.remotes.find((remote) => url.startsWith(remote.prefix)) || null;
  }

  private async getZip(baseUrl: string): Promise<Entry[]> {
    if (!this.zipCache.has(baseUrl)) {
      this.zipCache.set(
        baseUrl,
        new Promise(async (resolve, reject) => {
          const response = await this.fetch(baseUrl);
          if (!response.ok) {
            reject(
              new Error(
                `Failed to fetch zip from ${baseUrl}: ${response.status} ${response.statusText}`
              )
            );
          }
          const blob = await response.blob();
          const reader = new ZipReader(new BlobReader(blob));
          const entries = await reader.getEntries();
          resolve(entries);
        })
      );
    }
    return this.zipCache.get(baseUrl);
  }
}
