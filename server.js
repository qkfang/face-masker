const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const FACE_API = path.dirname(require.resolve('@vladmandic/face-api/package.json'));

// URL prefix -> directory on disk
const roots = [
  ['/model/', path.join(FACE_API, 'model')],
  ['/lib/', path.join(FACE_API, 'dist')],
  ['/', path.join(__dirname, 'public')],
];

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.bin': 'application/octet-stream',
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath === '/') urlPath = '/index.html';
    const [prefix, dir] = roots.find(([p]) => urlPath.startsWith(p));
    const file = path.normalize(path.join(dir, urlPath.slice(prefix.length)));
    if (!file.startsWith(dir + path.sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404).end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Face Masker running at http://localhost:${PORT}`));
