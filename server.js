const http = require('http');
const {exec} = require('child_process');
const fetch = require('node-fetch');
const port = 5555;
const supported_platforms = {
	'linux': {name: 'Debian/Ubuntu', stage: 'prod', network_interface: 'wlan1'}, 
	'win32': {name: 'Windows 32/64', stage: 'test', network_interface: ''},
	'darwin': {name: 'MacOS', stage: 'dev', network_interface: 'en0'},
};
const {LOCAL_RUN} = process.env;
async function getMyIPv(version, interface) {
	let processGetIp = () => {
		return new Promise((resolve, reject) => {
			function handleGetIp(error, stdout, stderr) {
				if (error || stderr) {
					stderr && console.log(`stderr: ${stderr}`);
					error && console.log(`error: ${error.message}`);
					reject(stderr);
				} else {
					let result = stdout.split('\n')[0];
					if (version === 6 && process.platform === 'linux')
						result += `%${interface}`;
					console.log(`stdout: ${result}`);
					resolve(result);
				}
			}
			exec(`ifconfig ${interface} | grep "inet${version === 6 ? '6' : ''} " | awk '{print $2}'`, handleGetIp);		
		});
	};
	return await processGetIp();
}
function getAddressUrl(a) {
	const {family, address, port} = a.address();
	if (family === 'IPv6') {
		if (process.platform === 'win32')
			return `http://[${address.split('%')[0]}]:${port}/`;
		return `http://[${address}]:${port}/`;
	}
	return `http://${address}:${port}/`;
}
function getAddressDescription(a) {
	const url = getAddressUrl(a);
	const {family} = a.address();
	return `${family} ${url}`;
}
async function run() {
	if (!(process.platform in supported_platforms)) {
		process.exit(1);
	}
	const {name, stage, network_interface} = supported_platforms[process.platform];
	console.log(`platform detected: ${process.platform} (${name}), stage ${stage}`);

	const ipv4 = LOCAL_RUN ? '127.0.0.1' : await getMyIPv(4, network_interface);
	const ipv6 = LOCAL_RUN ? '::1' : await getMyIPv(6, network_interface);
	const a = http.createServer(async (req, res) => {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(`hello IPv6! @ ${ipv6}`);
	}).listen(port, ipv6, () => console.log(`run at ${getAddressDescription(a)}`));
	const b = http.createServer(async (req, res) => {
		let text = null;
		try {
			const response = await fetch(getAddressUrl(a));
			text = await response.text();
		}
		catch(e) {
			text = e.message;
		}
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(`hello IPv4! and bridge says: ${text}. @ ${ipv6}`);
	}).listen(port, ipv4, () => console.log(`run at ${getAddressDescription(b)}`));
}
run();