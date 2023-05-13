const http = require('http');
const {exec} = require('child_process');
const port = 5555;
const supported_platforms = {
	'linux': {name: 'Debian/Ubuntu', stage: 'prod', network_interface_terminal: 'wlan1', network_interface_mesh: 'wlan0'}, 
	'win32': {name: 'Windows 32/64', stage: 'test', network_interface_terminal: '', network_interface_mesh: ''},
	'darwin': {name: 'MacOS', stage: 'dev', network_interface_terminal: 'en0', network_interface_mesh: 'en0'},
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
async function curl(url) {
	const process_curl = () => {
		return new Promise((resolve, reject) => {
			function handle_curl(error, stdout, stderr) {
				if (error) {
					stderr && console.log(`stderr: ${stderr}`);
					error && console.log(`error: ${error.message || error}`);
					reject(error);
				} else {
					console.log(`stdout: ${stdout}`);
					resolve(stdout);
				}
			}
			exec(`curl --request GET --url '${url}'`, handle_curl);
		});
	};
	return await process_curl();
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
	const {name, stage, network_interface_terminal, network_interface_mesh} = supported_platforms[process.platform];
	console.log(`platform detected: ${process.platform} (${name}), stage ${stage}`);
	const ipv4 = LOCAL_RUN ? '127.0.0.1' : await getMyIPv(4, network_interface_terminal);
	const ipv6 = LOCAL_RUN ? '::1' : await getMyIPv(6, network_interface_mesh);
	const a = http.createServer(async (req, res) => {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(`hello IPv6! @ ${ipv6}`);
	}).listen(port, ipv6, () => console.log(`run at ${getAddressDescription(a)}`));
	const b = http.createServer(async (req, res) => {
		let text = null;
		try {
			text = await curl(getAddressUrl(a));
		}
		catch (error) {
			text = error;
		}
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(`hello IPv4! and bridge says: ${text}. @ ${ipv4}`);
	}).listen(port, ipv4, () => console.log(`run at ${getAddressDescription(b)}`));
}
run();
