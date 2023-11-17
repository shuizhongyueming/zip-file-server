
ZipFileServer is a lightweight library that serves as an intermediary between the web client and the server. 

It provides an efficient way to package and download numerous fragmented files as required.

The Core zip inflate feature is based on [zip.js](https://github.com/gildas-lormeau/zip.js).

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)
- [License](#license)

## Overview

When ZipFileServer receives a file request, it prioritizes searching and delivering from the corresponding remote zip package.

This process is seamless for both the client and the server.

## Installation

To install ZipFileServer, run the following command:

```bash
npm install zip-file-server
```

## Usage

Please refer to the provided example for detailed usage.

```javascript
  import {ZipFileServer} from '../dist/main.js';

  const server = new ZipFileServer({
    remotes: [
      {
        name: 'bundle',
        prefix: 'bundle/',
        zipUrl: 'bundle.zip'
      },
      {
        name: 'res',
        prefix: 'res/',
        zipUrl: 'res.zip'
      }
    ],
    fallbackUrl: '/example/',
    fetch: (opt) => fetch(opt)
  });

  window.server = server;

  function showImg(url) {
    return new Promise(resolve => {
      const img = new Image();
      server.getUrl(url).then(({url, onComplete}) => {
        img.src = url;
        img.onload = () => {
          onComplete();
          resolve();
        };
      });
      document.body.appendChild(img);
    })
  }

  server.preload('res').then(() => {
    console.log('preload res.zip done');

    // no need to load res.zip again
    showImg('res/img.png').then(() => {
      console.log('load res/img.png done');

      // unload res.zip
      server.unload('res');

      // this time will load res.zip again
      showImg('res/img2.png').then(() => {
        console.log('load res/img2.png done');
      });
    });
  });

  server.getData('bundle/data.json')
    .then(data => data.json())
    .then(data => console.log('data.json', data));

  showImg('bundle/img.png');

  server.getData('bundle/info.txt').then(res => res.text()).then(data => {
    console.log('info.txt', data);
  });
```

## License

ZipFileServer is BSD-3-Clause licensed