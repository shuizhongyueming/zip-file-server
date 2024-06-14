

import {ZipFileServer} from '../dist/main.esm.js';

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
window.showImg = showImg;

function loadScript(url) {
  return new Promise(resolve => {
    const script = document.createElement('script');
    server.getUrl(url).then(({url, onComplete}) => {
      script.src = url;
      script.onload = () => {
        onComplete();
        resolve();
      };
    });
    document.body.appendChild(script);
  });
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

  server.addRemote({
    name: 'extra',
    zipUrl: 'extra.zip',
    prefix: 'extra/'
  });

  loadScript('extra/e.js').then(() => {
    console.log('load extra/e.js done');
  });
});

server.getData('bundle/data.json')
  .then(data => data.json())
  .then(data => console.log('data.json', data));

showImg('bundle/img.png');

server.getData('bundle/info.txt').then(res => res.text()).then(data => {
  console.log('info.txt', data);
});