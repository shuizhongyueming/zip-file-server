
ZipServer is a lightweight library that serves as an intermediary between the web client and the server. It provides an efficient way to package and download numerous fragmented files as required.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Usage](#usage)

## Overview

When ZipServer receives a file request, it prioritizes searching and delivering from the corresponding remote zip package.

This process is seamless for both the client and the server.

## Installation

To install ZipServer, run the following command:

```bash
npm install zip-server
```

## Usage

Please refer to the provided example for detailed usage.

```javascript
import {ZipServer} from '../dist/main.js';

const server = new ZipServer({
  remotes: [
    {
      prefix: 'bundle/',
      zipUrl: 'bundle.zip'
    }
  ],
  fallbackUrl: '/example/',
  fetch: (opt) => fetch(opt)
});

// read data.json from bundle.zip
server.getData('bundle/data.json')
  .then(data => data.json())
  .then(data => console.log('data.json', data));

// load img.png from bundle.zip
const img = new Image();
server.getUrl('bundle/img.png').then(({url, onComplete}) => {
  img.src = url;
  img.onload = onComplete;
});
document.body.appendChild(img);

// read info.txt from fallback remote server
server.getData('bundle/info.txt').then(res => res.text()).then(data => {
  console.log('info.txt', data);
});
```
