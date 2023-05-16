const http = require('http');
const uuid = require('ordered-uuid-v4-fixed');
const {exec} = require('child_process');
const standard_port = 5555;
const port = process.env.PORT || standard_port; //  work on custom port at dev stage
const supported_platforms = {
	'linux': {name: 'Debian/Ubuntu', stage: 'prod', network_interface_terminal: 'wlan1', network_interface_mesh: 'wlan0'}, 
	'win32': {name: 'Windows 32/64', stage: 'test', network_interface_terminal: '', network_interface_mesh: ''},
	'darwin': {name: 'MacOS', stage: 'dev', network_interface_terminal: 'en0', network_interface_mesh: 'en0'},
};
const {LOCAL_RUN} = process.env;
const history = {messages: {}, events: {}};
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
	async function ping(url) {
		let text = null;
		try {
			text = await curl(url);
		}
		catch (error) {
			text = error;
		}
		return text;
	}
	async function ping_wrap(url) {
		return `hello IPv4! and bridge says: ${await ping(url)}. @ ${ipv4}:${port}`;
	}
	
	if (!(process.platform in supported_platforms)) {
		process.exit(1);
	}
	const {name, stage, network_interface_terminal, network_interface_mesh} = supported_platforms[process.platform];
	console.log(`platform detected: ${process.platform} (${name}), stage ${stage}`);
	const ipv4 = LOCAL_RUN ? '127.0.0.1' : await getMyIPv(4, network_interface_terminal);
	const ipv6 = LOCAL_RUN ? '::1' : await getMyIPv(6, network_interface_mesh);
	const a = http.createServer(async (req, res) => {
		console.log(`incoming ipv6 ping - [${ipv6}]:${port}`);
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(`hello IPv6! @ [${ipv6}]:${port}`);
	}).listen(port, ipv6, () => console.log(`run at ${getAddressDescription(a)}`));
	const b = http.createServer(async (req, res) => {
		const urlParts = req.url.split('?');
		const apiMethod = urlParts[0];
		const apiParameter = urlParts[1];
		if (apiMethod === '/') {
			res.writeHead(200, { "Content-Type": "text/html" });
			res.end(`
				<div>${await ping_wrap(getAddressUrl(a))}</div>
				<div>
					<input id="ipv6_1" value="::1"><input id="port_1" value="5555">
					<button onclick="onclick_button(1);">ping</button><span id="result_1"></span>
				</div>
				<div>
					<input id="ipv6_2" value="::1"><input id="port_2" value="5555">
					<button onclick="onclick_button(2);">ping</button><span id="result_2"></span>
				</div>
				<script>
					async function onclick_button(id) {
						const ipv6 = document.getElementById('ipv6_' + id).value;
						const port = document.getElementById('port_' + id).value;
						const response = await fetch(location.href + 'ping?http://[' + ipv6 + ']:' + port + '/');
						const result = await response.text();
						document.getElementById('result_' + id).textContent = result;
					}
				</script>
			`);
		}
		else if (apiMethod === '/ping') {
			res.writeHead(200, { "Content-Type": "text/html" });
			const result = await ping(apiParameter || getAddressUrl(a));
			const text = result.message ? result.message : result;
			history.events[uuid.generate()] = text;
			res.end(text);
		}
		else if (apiMethod === '/history') {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify(history));
		}
		else {
			res.writeHead(404, { 'Content-Type': 'text/html' });
			res.end(`page not found`);	
		}
	}).listen(port, ipv4, () => console.log(`run at ${getAddressDescription(b)}`));
}
run();
