

import {ZipServer} from '../dist/main.js';
console.log(ZipServer);

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

server.getData('bundle/data.json')
  .then(data => data.json())
  .then(data => console.log('data.json', data));

const img = new Image();
server.getUrl('bundle/img.png').then(({url, onComplete}) => {
  img.src = url;
  img.onload = onComplete;
});
document.body.appendChild(img);

server.getData('bundle/info.txt').then(res => res.text()).then(data => {
  console.log('info.txt', data);
});