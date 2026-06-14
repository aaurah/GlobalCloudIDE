const http = require('http');
const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end('<h1>Hello from Orah!</h1><p>Deployed via CloudIDE</p>');
});
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
