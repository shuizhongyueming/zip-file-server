import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {createServer, type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import {BlobReader, ZipReader} from '@zip.js/zip.js';

import {ZipFileServer} from '../src/main';

const zipPath = 'test/test-fixture.zip';
const chinesePath = 'assets/精灵-战士.png';
const expectedPrefixBytes = [0x89, 0x50, 0x4E, 0x47];

describe('ZipFileServer Chinese filenames', () => {
  let server: Server;
  let zipBuffer: Buffer;
  let zipUrl: string;
  let fallbackFetch: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    zipBuffer = await readFile(zipPath);
    server = createServer((request, response) => {
      if (request.url === '/test-fixture.zip') {
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/zip');
        response.setHeader('Content-Length', zipBuffer.length);
        response.end(zipBuffer);
        return;
      }

      response.statusCode = 404;
      response.end('not found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start test server');
    }

    zipUrl = `http://127.0.0.1:${address.port}/test-fixture.zip`;
    Object.assign(globalThis, {
      location: new URL(`http://127.0.0.1:${address.port}/`),
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it('decodes UTF-8 filenames without the UTF-8 flag', async () => {
    const reader = new ZipReader(new BlobReader(new Blob([zipBuffer])));
    const entries = await reader.getEntries({
      decodeText: (rawText, encoding) => {
        if (encoding !== 'cp437') {
          return undefined;
        }
        try {
          const decoded = new TextDecoder('utf-8', {fatal: true}).decode(rawText);
          const encoded = new TextEncoder().encode(decoded);
          return encoded.length === rawText.length && encoded.every((byte, index) => byte === rawText[index])
            ? decoded
            : undefined;
        } catch {
          return undefined;
        }
      },
    });

    expect(entries.some((entry) => entry.filename === chinesePath)).toBe(true);

    await reader.close();
  });

  it('serves data for a Chinese-named entry without falling back', async () => {
    fallbackFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('fallback'));
    const zipFileServer = new ZipFileServer({
      remotes: [
        {
          name: 'loading',
          prefix: '',
          zipUrl,
        },
      ],
      fetch: fallbackFetch,
      fallbackUrl: 'http://127.0.0.1/fallback/',
    });

    const response = await zipFileServer.getData(chinesePath);
    const bytes = new Uint8Array(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(bytes.length).toBe(36);
    expect(Array.from(bytes.slice(0, expectedPrefixBytes.length))).toEqual(expectedPrefixBytes);
    expect(fallbackFetch).not.toHaveBeenCalled();
  });

  it('returns a blob URL for a Chinese-named entry and still falls back for missing entries', async () => {
    fallbackFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response('fallback'));
    const zipFileServer = new ZipFileServer({
      remotes: [
        {
          name: 'loading',
          prefix: '',
          zipUrl,
        },
      ],
      fetch: fallbackFetch,
      fallbackUrl: 'http://127.0.0.1/fallback/',
    });

    const {url, onComplete} = await zipFileServer.getUrl(chinesePath);
    expect(url.startsWith('blob:')).toBe(true);
    expect(fallbackFetch).not.toHaveBeenCalled();
    onComplete();

    const fallbackResponse = await zipFileServer.getData('assets/missing-file.txt');
    expect(await fallbackResponse.text()).toBe('fallback');
    expect(fallbackFetch).toHaveBeenCalledTimes(1);
    expect(fallbackFetch).toHaveBeenCalledWith('assets/missing-file.txt', undefined);
  });
});
