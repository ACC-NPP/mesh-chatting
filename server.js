const http = require('http');
const fetch = require('node-fetch');
const port = 5555;
//const ipv4 = '127.0.0.1'; // local host
const ipv4 = '192.168.1.136'; // local network
//const ipv6 = '::1'; // local host
const ipv6 = 'fe80::cc4:4da:69b2:5df0%en0'; // local network
function getAddressUrl(a) {
	let {family, address, port} = a.address();
	if (family === 'IPv6')
		address = `[${address.split('%')[0]}]`;
	return `http://${address}:${port}`;
}
function getAddressDescription(a) {
	const url = getAddressUrl(a);
	const {family} = a.address();
	return `${family} ${url}`;
}
const a = http
	.createServer(async (req, res) => {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end('hello ipv6!');
	}).listen(port, ipv6,
		() => console.log(`run at ${getAddressDescription(a)}/`));
const b = http
	.createServer(async (req, res) => {
		//const response = await fetch(getAddressUrl(a));
		const text = null;//await response.text();

		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(`hello ipv4! and bridge says: ${text}`);
	})
	.listen(port, ipv4,
		() => console.log(`run at ${getAddressDescription(b)}/`));
